---
layout: default
title: Deployment
nav_order: 9
---

# Deployment
{: .no_toc }

{: .warning }
proxiq does not handle TLS. Always put a TLS terminator (nginx, Caddy, or a cloud load balancer) in front before exposing port 3099 to the internet.

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## Docker (any VPS)

```bash
git clone https://github.com/appmattic/proxiq
cd proxiq

# Start (builds the container on first run)
docker compose -f deploy/docker/docker-compose.yml up -d

# Verify
curl http://localhost:3099/proxiq/health
```

To mount a config file with your API keys and policies:

```bash
# Create your config first
cp .proxiq.json .proxiq.production.json
# Edit .proxiq.production.json — set adminPassword, auth tokens, policies, etc.

docker compose -f deploy/docker/docker-compose.yml up -d \
  -e PROXIQ_ADMIN_PASSWORD=yourpassword
# Or mount the config file by uncommenting the volume line in docker-compose.yml
```

Data is persisted in the `proxiq_data` named volume. The container exposes port 3099 bound to `127.0.0.1` — put nginx or Caddy in front before exposing publicly.

---

## DigitalOcean / Hetzner

Minimum: Ubuntu 22.04, 1 GB RAM, 2 GB disk.

```bash
# SSH into your droplet, then clone and run the setup script:
git clone https://github.com/appmattic/proxiq
cd proxiq
bash setup.sh

# Or install a pre-built binary directly:
curl -fsSL https://get.proxiq.io/install.sh | sh
proxiq config init
```

Start on all interfaces (behind nginx/Caddy):

```bash
proxiq start --host 127.0.0.1
```

For persistent operation via systemd:

```bash
sudo tee /etc/systemd/system/proxiq.service << 'EOF'
[Unit]
Description=proxiq LLM context proxy
After=network.target

[Service]
ExecStart=/usr/local/bin/proxiq start --host 127.0.0.1
Restart=always
User=nobody
Environment=PROXIQ_STORAGE_PATH=/var/lib/proxiq/cache.db
Environment=PROXIQ_LOG_FORMAT=json

[Install]
WantedBy=multi-user.target
EOF

sudo mkdir -p /var/lib/proxiq && sudo chown nobody:nobody /var/lib/proxiq
sudo systemctl enable --now proxiq
```

### Nginx TLS terminator

```nginx
server {
    listen 443 ssl;
    server_name proxiq.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/proxiq.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/proxiq.yourdomain.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3099;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

---

## AWS EC2 via CloudFormation

```bash
aws cloudformation deploy \
  --template-file deploy/aws/cloudformation.yml \
  --stack-name proxiq \
  --parameter-overrides \
    KeyName=my-key-pair \
    AllowedCIDR=10.0.0.0/8 \
  --capabilities CAPABILITY_IAM
```

Creates: t3.micro, security group (ports 22 + 3099), IAM role with SSM access, systemd service.

{: .warning }
Restrict `AllowedCIDR` to your VPC CIDR or bastion IP. Never expose port 3099 publicly without TLS.

---

## Azure VM via ARM Template

```bash
az deployment group create \
  --resource-group my-rg \
  --template-file deploy/azure/arm-template.json \
  --parameters adminPasswordOrKey="$(cat ~/.ssh/id_rsa.pub)" \
               proxiqVersion="0.1.0"
```

Creates: Standard_B1s VM (Ubuntu 22.04), NSG (ports 22 + 3099), public IP.

---

## Health check

```bash
curl http://127.0.0.1:3099/proxiq/health
# → {"status":"ok","version":"0.1.0","uptimeSeconds":42,"cacheHitRate":0.73}

curl http://127.0.0.1:3099/proxiq/metrics
```
