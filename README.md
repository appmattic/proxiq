# GitHub Pages — proxiq docs site

This directory contains the Jekyll source for the proxiq documentation site,
built with the [Just the Docs](https://just-the-docs.com) theme.

## Structure

```
site/
  _config.yml         # Jekyll + Just the Docs configuration
  Gemfile             # Ruby dependencies
  index.md            # Home page
  docs/
    getting-started.md
    configuration.md
    providers.md
    sdk.md
    cli.md
    claude-connector.md
    deployment.md
    architecture.md
    enterprise.md
```

## Local preview

```bash
cd site
bundle install
bundle exec jekyll serve
# → open http://localhost:4000
```

## Deployment

Pushing to `main` triggers `.github/workflows/docs.yml`, which:
1. Builds the Jekyll site from `site/`
2. Copies `deploy/scripts/install.sh` and `install.ps1` into the site root
3. Writes the CNAME file
4. Force-pushes the built output to the `gh-pages` branch

## DNS setup

| Subdomain | Type | Value |
|---|---|---|
| `proxiq.io` (apex) | A | GitHub Pages IPs (see below) |
| `www.proxiq.io` | CNAME | `appmattic.github.io` |
| `get.proxiq.io` | CNAME | `appmattic.github.io` |

GitHub Pages apex A records:
```
185.199.108.153
185.199.109.153
185.199.110.153
185.199.111.153
```

> Note: GitHub Pages only supports one custom domain per repo. If you want
> both `proxiq.io` (docs) and `get.proxiq.io` (install scripts) to work,
> set the CNAME in the workflow to `proxiq.io` and configure `get.proxiq.io`
> as a CNAME pointing to the same `appmattic.github.io`. GitHub will serve
> the same site for both — install.sh and install.ps1 are available at
> both domains since they are in the site root.
