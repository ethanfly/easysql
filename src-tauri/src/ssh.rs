use std::net::{TcpListener, TcpStream};
use std::io::{Read, Write};
use std::sync::Arc;
use std::thread;
use ssh2::Session;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum SshError {
    #[error("连接失败: {0}")]
    ConnectionError(String),
    #[error("认证失败: {0}")]
    AuthError(String),
    #[error("隧道创建失败: {0}")]
    TunnelError(String),
}

pub struct SshTunnel {
    pub local_port: u16,
    _handle: Option<thread::JoinHandle<()>>,
}

impl SshTunnel {
    pub async fn create(
        ssh_host: &str,
        ssh_port: u16,
        ssh_user: &str,
        ssh_password: Option<&str>,
        ssh_key: Option<&str>,
        remote_host: &str,
        remote_port: u16,
    ) -> Result<Self, SshError> {
        // 找一个可用的本地端口
        let listener = TcpListener::bind("127.0.0.1:0")
            .map_err(|e| SshError::TunnelError(e.to_string()))?;
        let local_port = listener.local_addr()
            .map_err(|e| SshError::TunnelError(e.to_string()))?
            .port();

        let ssh_host = ssh_host.to_string();
        let ssh_user = ssh_user.to_string();
        let ssh_password = ssh_password.map(|s| s.to_string());
        let ssh_key = ssh_key.map(|s| s.to_string());
        let remote_host = remote_host.to_string();

        // 在后台线程中运行隧道
        let handle = thread::spawn(move || {
            run_tunnel(
                listener,
                &ssh_host,
                ssh_port,
                &ssh_user,
                ssh_password.as_deref(),
                ssh_key.as_deref(),
                &remote_host,
                remote_port,
            );
        });

        // 等待一小段时间确保隧道建立
        tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;

        Ok(SshTunnel {
            local_port,
            _handle: Some(handle),
        })
    }
}

fn run_tunnel(
    listener: TcpListener,
    ssh_host: &str,
    ssh_port: u16,
    ssh_user: &str,
    ssh_password: Option<&str>,
    ssh_key: Option<&str>,
    remote_host: &str,
    remote_port: u16,
) {
    // 连接 SSH 服务器
    let tcp = match TcpStream::connect(format!("{}:{}", ssh_host, ssh_port)) {
        Ok(t) => t,
        Err(e) => {
            tracing::error!("SSH 连接失败: {}", e);
            return;
        }
    };

    let mut sess = match Session::new() {
        Ok(s) => s,
        Err(e) => {
            tracing::error!("创建 SSH 会话失败: {}", e);
            return;
        }
    };

    sess.set_tcp_stream(tcp);
    if let Err(e) = sess.handshake() {
        tracing::error!("SSH 握手失败: {}", e);
        return;
    }

    // 认证
    let auth_result = if let Some(key_path) = ssh_key {
        sess.userauth_pubkey_file(ssh_user, None, std::path::Path::new(key_path), None)
    } else if let Some(password) = ssh_password {
        sess.userauth_password(ssh_user, password)
    } else {
        tracing::error!("SSH 需要密码或密钥");
        return;
    };

    if let Err(e) = auth_result {
        tracing::error!("SSH 认证失败: {}", e);
        return;
    }

    let sess = Arc::new(sess);

    // 监听本地连接并转发
    for stream in listener.incoming() {
        match stream {
            Ok(mut local_stream) => {
                let sess = sess.clone();
                let remote_host = remote_host.to_string();
                
                thread::spawn(move || {
                    match sess.channel_direct_tcpip(&remote_host, remote_port, None) {
                        Ok(mut channel) => {
                            let mut buf = [0u8; 8192];
                            loop {
                                // 从本地读取
                                match local_stream.read(&mut buf) {
                                    Ok(0) => break,
                                    Ok(n) => {
                                        if channel.write_all(&buf[..n]).is_err() {
                                            break;
                                        }
                                    }
                                    Err(_) => break,
                                }

                                // 从远程读取
                                match channel.read(&mut buf) {
                                    Ok(0) => break,
                                    Ok(n) => {
                                        if local_stream.write_all(&buf[..n]).is_err() {
                                            break;
                                        }
                                    }
                                    Err(_) => break,
                                }
                            }
                        }
                        Err(e) => {
                            tracing::error!("创建 SSH 通道失败: {}", e);
                        }
                    }
                });
            }
            Err(e) => {
                tracing::error!("接受本地连接失败: {}", e);
            }
        }
    }
}

