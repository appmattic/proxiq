# Proxiq Deployment Guide

> **TLS warning:** Proxiq does not handle TLS. Always put a TLS terminator (nginx, Caddy, or a cloud load balancer) in front before exposing port 3099 to the internet.

---

## Option 1: Bare metal / VPS (systemd)

```bash
# Install
curl -fsSL https://get.proxiq.io/install.sh | sh

# Create config
proxiq config init

# Create systemd service
sudo tee /etc/systemd/system/proxiq.service << 'EOF'
[Unit]
Description=Proxiq LLM context proxy
After=network.target

[Service]
ExecStart=/usr/local/bin/proxiq start --host 127.0.0.1
Restart=always
User=nobody
Environment=PROXIQ_STORAGE_PATH=/var/lib/proxiq/cache.db
Environment=PROXIQ_LOG_FORMAT=json
WorkingDirectory=/etc/proxiq

[Install]
WantedBy=multi-user.target
EOF

sudo mkdir -p /var/lib/proxiq && sudo chown nobody:nobody /var/lib/proxiq
sudo systemctl daemon-reload
sudo systemctl enable --now proxiq
```

---

## Option 2: Docker

```bash
docker run -d \
  --name proxiq \
  -p 127.0.0.1:3099:3099 \
  -v proxiq-data:/data \
  -e PROXIQ_LOG_LEVEL=info \
  ghcr.io/appmattic/proxiq
```

With a config file:

```bash
docker run -d \
  --name proxiq \
  -p 127.0.0.1:3099:3099 \
  -v proxiq-data:/data \
  -v $(pwd)/.proxiq.json:/app/.proxiq.json:ro \
  ghcr.io/appmattic/proxiq
```

---

## Option 3: Docker Compose

```yaml
services:
  proxiq:
    image: ghcr.io/appmattic/proxiq
    ports:
      - "127.0.0.1:3099:3099"
    volumes:
      - proxiq_data:/data
      - ./.proxiq.json:/app/.proxiq.json:ro
    environment:
      - PROXIQ_LOG_LEVEL=info
    restart: unless-stopped

volumes:
  proxiq_data:
```

---

## Option 4: Build from source + Docker

```bash
git clone https://github.com/appmattic/proxiq
cd proxiq
bun install
docker build -f deploy/docker/Dockerfile -t proxiq .
docker run -p 3099:3099 proxiq
```

---

## Option 5: AWS (CloudFormation)

Deploys a `t3.micro` EC2 instance with Proxiq running as a systemd service.

```bash
aws cloudformation deploy \
  --template-file deploy/aws/cloudformation.yml \
  --stack-name proxiq \
  --parameter-overrides ProxiqVersion=latest \
  --capabilities CAPABILITY_IAM
```

Output `ProxiqEndpoint` — the Proxiq URL. Put an ALB with TLS in front for production.

---

## Option 6: Azure (ARM template)

Deploys a `Standard_B1s` VM (Ubuntu 22.04) with Proxiq via custom script extension.

```bash
az deployment group create \
  --resource-group my-rg \
  --template-file deploy/azure/arm-template.json \
  --parameters proxiqVersion=latest
```

Put an Azure Application Gateway with TLS in front for production.

---

## Verify the deployment

```bash
curl http://127.0.0.1:3099/proxiq/health
# {"status":"ok","version":"0.1.0"}

curl http://127.0.0.1:3099/proxiq/metrics
# {"totalRequests":0,"cacheHits":0,...}
```

---

## nginx TLS reverse proxy

```nginx
server {
    listen 443 ssl;
    server_name proxiq.yourdomain.com;

    ssl_certificate     /etc/letsencrypt/live/proxiq.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/proxiq.yourdomain.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3099;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 120s;
    }
}
```
