# Shared-VPS studio and Vercel deployment

Prepared configuration, not a live deployment. Execute only as the lead after source integration. Never restart/recreate the shared Caddy or another project's service. Commands below use Bash (WSL locally, Ubuntu on the VPS); keep shell tracing OFF. Never paste secrets or raw studio/CRE output into proof artifacts.

## Observed layout and chosen boundary

[V: read-only SSH inspection, 2026-10-09] `vps-caddy-1` runs `caddy:2-alpine`, publishes TCP 80/443 and mounts `/opt/annona/deploy/vps/Caddyfile` read-only at `/etc/caddy/Caddyfile`. Certificates/config persist in `vps_caddy_data` and `vps_caddy_config`. Its only network is `vps_annona`, gateway `172.18.0.1`, Caddy peer `172.18.0.4`. Existing sites use Docker DNS names or bridge-gateway host ports. `/usr/local/bin/bun` exists, but its version was not exercised; CRE is not in that directory. SAYSO directories do not yet exist.

Use a dedicated host systemd studio, not a second operator container. Studio keeps its existing `127.0.0.1:3001` listener and loopback-only client identity check. A SAYSO-only Caddy gateway container uses host networking but binds ONLY `172.18.0.1:13001`; only the shared Caddy's exact peer IP is admitted. The shared Caddy receives one appended HTTPS site block. This requires no shared-container mount changes or restart and lets CRE use its own authenticated writable home. It avoids fragile sharing of the existing container's network namespace.

Trust chain: public Caddy overwrites both `X-Sayso-Client-IP` and `X-Forwarded-For` with its socket peer. Gateway accepts only `SAYSO_CADDY_IP`, then overwrites both upstream headers from that already-sanitized `X-Sayso-Client-IP`. Studio ignores X-Forwarded-For and accepts the custom single-IP header only from loopback. Do not put another CDN/proxy in front of this without redesigning the boundary. Other VPS users/processes remain trusted host administrators. If Caddy is ever recreated, re-inspect its IP and update ONLY the SAYSO gateway config before restoring traffic.

Media is a separate root-owned MP4-only export. Gateway mounts `/srv/sayso/media`, NEVER `/var/lib/sayso`. Only `/media/0x<64 lowercase hex>.mp4` is public; directory browsing and JSON paths are 404. Caddy file_server supports byte ranges [V: https://caddyserver.com/docs/caddyfile/directives/file_server]. Reveal API remains the studio's delayed chunk route (425 before eligibility), never a static file path. API/SSE/reveal responses remain no-store.

## Free hostname decision

Recommend `SAYSO_STUDIO_HOST=sayso-studio.43-129-38-115.nip.io`, rendered into the shared snippet before insertion. No domain purchase/account/token is required; existing VPS projects already use this provider. `sslip.io` is a fallback, not an independently operated DNS provider: nip.io and sslip.io now share an operator/backend [V: https://nip.io/]. Both resolve embedded public IPs and document Caddy/HTTP-01 certificates; neither supports wildcard certificates. The provider reports an increased 250,000-certificate limit; the exact override scope/availability is [U], so actual successful issuance is still required. Do not promise freedom from rate limits.

[V: https://publicsuffix.org/list/public_suffix_list.dat, version 2026-10-07] `duckdns.org` and `vercel.app` are public suffix entries; `nip.io`/`sslip.io` are not. [V: https://letsencrypt.org/docs/rate-limits/] LE uses the PSL and defaults to 50 new certificates/registered domain/7 days, 5/exact identifier set/7 days, 300 orders/account/3 hours and 5 authorization failures/identifier/account/hour. Thus nip/sslip share their provider's registered-domain issuance pool; arbitrary extra labels do NOT isolate it. DuckDNS isolates the default registered-domain quota at `<name>.duckdns.org`, and survives an IP change, but requires an available account/subdomain and protected update token [V: https://www.duckdns.org/spec.jsp]. Prefer it if nip issuance is actually blocked; HTTP-01 needs no Caddy DNS plugin. Preserve existing Caddy certificate volumes, never delete certificates to retry, and honor Retry-After. Changing the studio host does not change the web RP ID.

## Memory budget and gates

[V] Inspection: total 1,967 MiB, available 525 MiB, swap used 911 MiB, disk free 8.8 GiB. Use the assignment's more conservative 495 MiB available for admission:

| Incremental allocation | Hard cap / reserve |
|---|---:|
| Studio plus ALL CRE/compiler descendants (systemd MemoryMax) | 192 MiB |
| SAYSO gateway including tmpfs (Docker mem_limit) | 64 MiB |
| Existing Caddy reload/certificate transient reserve [I] | 32 MiB |
| Remaining conservative headroom | 207 MiB |
| Total | 495 MiB |

No new swap allowance. Studio MemoryHigh is 160 MiB, CPU cap 75% of one CPU; gateway cap is 10%. Build/install Linux dependencies locally in WSL, not on the 2-vCPU shared host. Use hosted Envio; this table does NOT reserve for its VPS fallback. [U] A real CRE compile/simulation plus concurrent playback must fit the 192 MiB service cap; configuration arithmetic is not measured runtime proof. If OOM/throttling breaks settlement or flag latency, stop only SAYSO and move it to a larger host; do not raise caps or evict another project silently. Recheck free RAM/disk before starting, and defer when available RAM is below 495 MiB.

## Ordered deployment

### 1. Reserve the web hostname FIRST

Create a Vercel Hobby project using this repository, Root Directory `apps/web`, framework Vite, Node 24.x. Enable **Include source files outside of the Root Directory in the Build Step**. Keep the complete monorepo checkout/lockfile available: `@sayso/core` is a `workspace:*` dependency and exports TypeScript directly; a standalone upload of apps/web cannot install/build it. The tracked vercel.json supplies:

- Install: `cd ../.. && bun install --frozen-lockfile --filter @sayso/web --filter @sayso/core`
- Build (in apps/web): `bun run build`
- Output: `dist`
- SPA rewrite to index.html; immutable hashed assets; no-store sw.js/registerSW.js/workbox scripts/manifest.webmanifest.

[V: https://vercel.com/docs/monorepos/monorepo-faq, https://vercel.com/docs/package-managers] Vercel supports this layout/Bun and outside-root source access. [V: local `bun run --cwd apps/web build`, 2026-10-09] The workspace-root build completed, including sw.js/manifest/workbox generation and @sayso/core imports; Vite retains the existing >500 kB decorative chunk warning. [U] The fresh filtered install and actual Vercel deployment have not been exercised. Check that deployment log uses pinned Bun 1.3.14 and Node >=24.21.0; do not silently accept a lower engine. No Vercel functions or media hosting are needed.

Set Production build variables (all public; never role keys):

| Variable | Value |
|---|---|
| `VITE_STUDIO_URL` | `https://sayso-studio.43-129-38-115.nip.io` (no trailing slash) |
| `VITE_INDEXER_URL` | Actual public HTTPS Envio GraphQL URL from the indexer deployment |
| `VITE_RPC_URL` | `https://testnet-rpc.monad.xyz`, or a browser-safe public testnet RPC |
| `VITE_RP_ID` | The exact permanent `<project>.vercel.app` HOST, no scheme/path |

These are ALL VITE_* reads found in apps/web; DEV and BASE_URL are Vite built-ins. Set RP ID BEFORE the first real passkey, not after. Do not enroll on changing preview URLs with a production RP ID. Preview CORS is opt-in exact origins, not `*.vercel.app`; use throwaway preview accounts. The indexer must separately allow the production web origin. No `.env.example` existed under apps/web; none was added.

### 2. Prepare source/dependencies and pinned runtimes locally

After the lead commits the integrated change, run in WSL at the repo root. These artifacts contain public source/dependencies ONLY; private data/env travels separately under owner control.

```sh
set -euo pipefail
set +x
RELEASE="$(git rev-parse --short=12 HEAD)"
STAGE="/tmp/sayso-release-$RELEASE"
RUNTIME=/tmp/sayso-runtime
mkdir -p "$STAGE" "$RUNTIME"
git archive HEAD package.json bun.lock tsconfig.base.json apps/studio packages/core cre/resolver deploy/Caddyfile deploy/sayso-studio.service deploy/studio.compose.yaml deploy/studio.gateway.Caddyfile deploy/studio.resolver.tsconfig.json deploy/studio.env.example deploy/studio.runbook.md | tar -x -C "$STAGE"
(cd "$STAGE" && bun install --frozen-lockfile --filter @sayso/studio --filter @sayso/resolver --filter @sayso/core)
curl -fL https://github.com/oven-sh/bun/releases/download/bun-v1.3.14/bun-linux-x64-baseline.zip -o "$RUNTIME/bun.zip"
printf '%s  %s\n' a063908ae08b7852ca10939bbdc6ceed3ddabce8fb9402dce83d65d73b36e6c7 "$RUNTIME/bun.zip" | sha256sum -c -
unzip -q "$RUNTIME/bun.zip" -d "$RUNTIME"
curl -fL https://nodejs.org/dist/v24.21.0/node-v24.21.0-linux-x64.tar.xz -o "$RUNTIME/node.tar.xz"
printf '%s  %s\n' fd8e59d5a511510f6a298afb548f18c7d2b1be404d8b4a27d94fbe49f56cb2d6 "$RUNTIME/node.tar.xz" | sha256sum -c -
tar -xJf "$RUNTIME/node.tar.xz" -C "$RUNTIME"
curl -fL https://github.com/smartcontractkit/cre-cli/releases/download/v1.36.0/cre_linux_amd64.tar.gz -o "$RUNTIME/cre.tar.gz"
printf '%s  %s\n' 44cc1eba84eb52a4405fbd3f0bf36971a1440711b0ae0b47df01cb9d537e3a94 "$RUNTIME/cre.tar.gz" | sha256sum -c -
tar -xzf "$RUNTIME/cre.tar.gz" -C "$RUNTIME"
install -m 0755 "$RUNTIME/cre_v1.36.0_linux_amd64" "$RUNTIME/cre"
rsync -aq "$STAGE/" "perago-vps:/tmp/sayso-release-$RELEASE/"
scp -q "$RUNTIME/bun-linux-x64-baseline/bun" "$RUNTIME/node-v24.21.0-linux-x64/bin/node" "$RUNTIME/cre" perago-vps:/tmp/
```

Digests are from official Bun/CRE release assets and Node SHASUMS256 [V: https://api.github.com/repos/oven-sh/bun/releases/tags/bun-v1.3.14, https://api.github.com/repos/smartcontractkit/cre-cli/releases/tags/v1.36.0, https://nodejs.org/dist/v24.21.0/SHASUMS256.txt]. No globally installed Bun/Node/CRE is replaced.

The CRE archive member is versioned, as the official installer confirms [V: https://cre.chain.link/install.sh]; install it under the private runtime name `cre`. Local WSL must have Bun 1.3.14, curl/unzip/tar/rsync and an owner-approved working `ssh perago-vps` route (e.g. an SSH agent); never copy a private SSH key into a transcript or this repository. Test that route with a read-only command before transferring anything.

### 3. Prepare SAYSO-only paths on the VPS

Open `ssh perago-vps`; set RELEASE to the public release identifier used above. Reinspect Caddy before any mutation and verify 13001 is unused. The gateway bind/IP values below must agree with that inspection.

```sh
set -euo pipefail
set +x
RELEASE='REPLACE_WITH_PUBLIC_RELEASE_ID'
SAYSO_STUDIO_HOST=sayso-studio.43-129-38-115.nip.io
WEB_ORIGIN='https://REPLACE_WITH_PERMANENT_PROJECT.vercel.app'
docker inspect vps-caddy-1 --format '{{json .Mounts}} {{json .NetworkSettings.Networks}}'
free -m
df -h /
sudo ss -ltnp '( sport = :13001 or sport = :3001 )'
sudo useradd --system --home-dir /var/lib/sayso --shell /usr/sbin/nologin sayso
sudo install -d -m 0755 /opt/sayso/releases /opt/sayso/bin /srv/sayso/media
sudo install -d -m 0700 /etc/sayso
sudo install -d -m 0700 -o sayso -g sayso /var/lib/sayso /var/lib/sayso/clips /var/lib/sayso/resolver
sudo cp -a "/tmp/sayso-release-$RELEASE" "/opt/sayso/releases/$RELEASE"
sudo chown -R root:root "/opt/sayso/releases/$RELEASE"
sudo ln -s "/opt/sayso/releases/$RELEASE" /opt/sayso/current
sudo install -m 0755 /tmp/bun /tmp/node /tmp/cre /opt/sayso/bin/
/opt/sayso/bin/bun --version
/opt/sayso/bin/node --version
/opt/sayso/bin/cre version
sudo install -m 0600 /opt/sayso/current/deploy/studio.env.example /etc/sayso/studio.env
sudoedit /etc/sayso/studio.env
```

First install only: useradd/ln must fail rather than overwrite an existing deployment; use the upgrade/rollback steps below for subsequent releases. Owner securely enters distinct funded role keys, stable salt (>=32 chars), CRE auth as needed, cast-code-verified receiver/start block, reveal URL and the exact WEB_ORIGIN into the editor, never CLI args/chat. Do not copy a local studio.env or wallets env. Check `CHAIN_ID=10143`. Stop ALL local studio/OPERATOR/BOT/DRIP/REPORTER processes before transferring state or starting the VPS writer; one active studio only.

### 4. Transfer private state and publish ONLY verified media

Owner selects a stopped consistent STUDIO_DATA_DIR snapshot; exclude env files and resolver login/cache. In a local WSL shell (not a logged transcript):

```sh
PRIVATE_DATA='REPLACE_WITH_OWNER_SELECTED_STOPPED_STUDIO_DATA_DIRECTORY'
ssh perago-vps 'umask 077; mkdir /tmp/sayso-private-data; chmod 0700 /tmp/sayso-private-data'
rsync -aq --exclude='*.env*' --exclude='.env*' --exclude='resolver/' "$PRIVATE_DATA/" perago-vps:/tmp/sayso-private-data/
```

On the VPS:

```sh
sudo rsync -aq /tmp/sayso-private-data/ /var/lib/sayso/
sudo chown -R sayso:sayso /var/lib/sayso
sudo chmod 0700 /var/lib/sayso /var/lib/sayso/clips
sudo rm -rf /tmp/sayso-private-data
```

If the source studio cannot be stopped, do not copy its SQLite/WAL independently: first take a consistent SQLite backup and coordinate a single-writer cutover. Do not expose private data, symlinks to it, transcripts, clip metadata JSON or flag plans. For each rights-cleared FINAL encoded MP4, locally select its matching private clip directory and export using this hash check; the script emits no metadata:

```sh
CLIP_DIRECTORY='REPLACE_WITH_PRIVATE_CLIP_DIRECTORY' MEDIA_FILE='REPLACE_WITH_FINAL_MP4' PUBLIC_MEDIA=/tmp/sayso-public-media bun -e '
import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
const clip = await Bun.file(join(process.env.CLIP_DIRECTORY, "clip.json")).json();
if (!/^0x[0-9a-f]{64}$/.test(clip.clip_id)) throw new Error("Invalid clip ID");
const digest = "0x" + createHash("sha256").update(await readFile(process.env.MEDIA_FILE)).digest("hex");
if (digest !== clip.media_sha256.toLowerCase()) throw new Error("Media commitment mismatch");
await mkdir(process.env.PUBLIC_MEDIA, { recursive: true });
await copyFile(process.env.MEDIA_FILE, join(process.env.PUBLIC_MEDIA, clip.clip_id + ".mp4"));
'
rsync -aq /tmp/sayso-public-media/ perago-vps:/tmp/sayso-public-media/
```

Use a fresh export directory containing only this release's approved MP4s. On the VPS:

```sh
sudo install -m 0644 /tmp/sayso-public-media/0x*.mp4 /srv/sayso/media/
sudo chown -R root:root /srv/sayso/media
sudo find /srv/sayso/media -mindepth 1 ! -type f -print
sudo find /srv/sayso/media -mindepth 1 ! -name '0x*.mp4' -print
```

Both find commands must print nothing. Gateway additionally enforces the exact lowercase hash path. Do not use rsync --delete on shared roots; public media is append-only immutable.

### 5. Prepare writable resolver and authentication

On the VPS, copy only resolver source/config, excluding prior build outputs. Do not edit a running resolver.

```sh
sudo cp -a /opt/sayso/current/cre/resolver/src /var/lib/sayso/resolver/
sudo cp /opt/sayso/current/cre/resolver/{project.yaml,workflow.yaml,package.json,config.monad-testnet.json} /var/lib/sayso/resolver/
sudo install -m 0644 /opt/sayso/current/deploy/studio.resolver.tsconfig.json /var/lib/sayso/resolver/tsconfig.json
sudo ln -s /opt/sayso/current/cre/resolver/node_modules /var/lib/sayso/resolver/node_modules
sudo chown -R sayso:sayso /var/lib/sayso/resolver
sudo systemd-run --wait --pipe --collect --unit=sayso-resolver-config -p User=sayso -p EnvironmentFile=/etc/sayso/studio.env /opt/sayso/bin/bun -e '
const path = "/var/lib/sayso/resolver/config.monad-testnet.json";
const config = await Bun.file(path).json();
config.revealApiBaseUrl = process.env.STUDIO_REVEAL_URL;
config.saysoMarkets = process.env.SAYSO_MARKETS;
await Bun.write(path, JSON.stringify(config, null, 2) + "\n");
await Bun.write("/var/lib/sayso/resolver/project.yaml", "monad-testnet:\n  rpcs:\n    - chain-name: monad-testnet\n      url: " + JSON.stringify(process.env.RPC_URL) + "\n");
'
sudo -u sayso env HOME=/var/lib/sayso PATH=/opt/sayso/bin:/usr/local/bin:/usr/bin:/bin /opt/sayso/bin/cre login
```

Existing explicit reportGasLimit is preserved. Owner completes CRE login locally as sayso, not root; CRE_API_KEY can instead be securely provisioned if supported by the account. Perform a real-event non-broadcast simulation under this user before admitting judging traffic; omit --broadcast. Do not capture raw output (it can contain outcome evidence). CLI simulation/compilation is part of the later memory/load gate, not proof merely from login.

### 6. Validate/start ONLY SAYSO gateway and studio

```sh
printf 'SAYSO_GATEWAY_BIND=172.18.0.1\nSAYSO_CADDY_IP=172.18.0.4\nSAYSO_MEDIA_DIR=/srv/sayso/media\n' | sudo tee /etc/sayso/gateway.env >/dev/null
sudo chmod 0600 /etc/sayso/gateway.env
sudo docker compose --env-file /etc/sayso/gateway.env -f /opt/sayso/current/deploy/studio.compose.yaml config --quiet
sudo docker compose --env-file /etc/sayso/gateway.env -f /opt/sayso/current/deploy/studio.compose.yaml run --rm --no-deps gateway caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
sudo docker compose --env-file /etc/sayso/gateway.env -f /opt/sayso/current/deploy/studio.compose.yaml up -d --pull never gateway
sudo install -m 0644 /opt/sayso/current/deploy/sayso-studio.service /etc/systemd/system/
sudo systemd-analyze verify /etc/systemd/system/sayso-studio.service
sudo systemctl daemon-reload
sudo systemctl enable --now sayso-studio
curl --fail --silent --show-error -H 'X-Sayso-Client-IP: 127.0.0.1' http://127.0.0.1:3001/v1/time
curl --silent --output /dev/null --write-out '%{http_code}\n' http://172.18.0.1:13001/v1/time
```

Second curl from the host must be 403 (unless the host's chosen source is the allowed Caddy peer, which requires investigating routing). No 3001/13001 listener on the public address. The shared image already exists; --pull never prevents changing any image unexpectedly. Do not install the removed host caddy.service.d override or a new host Caddy service.

### 7. Append and validate shared Caddy before reload

On the VPS, create a public-only candidate with the current complete Caddyfile as prefix. Hostname rendering is necessary because the running container was not created with SAYSO_STUDIO_HOST. Validate the standalone snippet and then the actual complete config inside the existing container. Because Caddy's host bind is a SINGLE FILE, overwrite its existing inode with tee; an atomic mv would leave the container seeing the old bind-mounted inode. Do not overwrite someone else's concurrent change.

```sh
BACKUP="/opt/annona/deploy/vps/Caddyfile.pre-sayso-$RELEASE"
sudo test ! -e "$BACKUP"
sudo cp -p /opt/annona/deploy/vps/Caddyfile "$BACKUP"
SAYSO_STUDIO_HOST="$SAYSO_STUDIO_HOST" /opt/sayso/bin/bun -e '
const input = await Bun.file("/opt/sayso/current/deploy/Caddyfile").text();
const host = process.env.SAYSO_STUDIO_HOST;
if (!/^[a-z0-9.-]+$/.test(host)) throw new Error("Invalid hostname");
await Bun.write("/tmp/sayso-site.Caddyfile", input.replaceAll("{$SAYSO_STUDIO_HOST}", host));
'
docker cp /tmp/sayso-site.Caddyfile vps-caddy-1:/tmp/sayso-site.Caddyfile
docker exec vps-caddy-1 caddy validate --config /tmp/sayso-site.Caddyfile --adapter caddyfile
sudo cat "$BACKUP" > /tmp/sayso-complete.Caddyfile
printf '\n# BEGIN SAYSO %s\n' "$RELEASE" >> /tmp/sayso-complete.Caddyfile
cat /tmp/sayso-site.Caddyfile >> /tmp/sayso-complete.Caddyfile
printf '\n# END SAYSO %s\n' "$RELEASE" >> /tmp/sayso-complete.Caddyfile
docker cp /tmp/sayso-complete.Caddyfile vps-caddy-1:/tmp/sayso-complete.Caddyfile
docker exec vps-caddy-1 caddy validate --config /tmp/sayso-complete.Caddyfile --adapter caddyfile
sudo cmp /opt/annona/deploy/vps/Caddyfile "$BACKUP"
sudo tee /opt/annona/deploy/vps/Caddyfile < /tmp/sayso-complete.Caddyfile > /dev/null
docker exec vps-caddy-1 caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
docker exec vps-caddy-1 caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
```

No `systemctl restart caddy`, no `docker restart`, no replacing existing site blocks. Do not repeat the append if the BEGIN SAYSO marker already exists. Do not touch existing monadboy configuration or services. Caddy obtains HTTPS automatically; DNS must resolve to this VPS and inbound 80/443 must remain reachable. Preserve /data and /config.

### 8. Acceptance checks and rollout gates

```sh
getent ahostsv4 "$SAYSO_STUDIO_HOST"
curl --fail --silent --show-error "https://$SAYSO_STUDIO_HOST/v1/time"
curl --fail --silent --show-error "https://$SAYSO_STUDIO_HOST/v1/health"
curl --silent --show-error -D - -o /dev/null -X OPTIONS -H "Origin: $WEB_ORIGIN" -H 'Access-Control-Request-Method: POST' -H 'Access-Control-Request-Headers: content-type' "https://$SAYSO_STUDIO_HOST/v1/episodes"
curl --silent --show-error -D - -o /dev/null -H 'Origin: https://unlisted.vercel.app' "https://$SAYSO_STUDIO_HOST/v1/time"
CLIP_ID='REPLACE_WITH_PUBLIC_LOWERCASE_CLIP_ID'
curl --fail --silent --show-error -D - -o /dev/null -H 'Range: bytes=0-1023' "https://$SAYSO_STUDIO_HOST/media/$CLIP_ID.mp4"
for path in /media/clip.json /media/flag-plan.json /media/ /studio.sqlite /clips/ /resolver/; do curl --silent --output /dev/null --write-out '%{http_code}\n' "https://$SAYSO_STUDIO_HOST$path"; done
```

Before sharing the URL with judges, select a real evidence trigger from the migrated studio/chain. Stop the writer only after its episode/CRE work drains. The smoke runs a temporary HTTP studio with all writer keys disabled and the real CLI together inside ONE 192 MiB transient cgroup; raw output is discarded. The transaction/log index is public, never a fabricated receipt.

```sh
TRIGGER_TX='REPLACE_WITH_REAL_TESTNET_EVIDENCE_TX'
TRIGGER_LOG_INDEX='REPLACE_WITH_ITS_RECEIPT_LOG_INDEX'
sudo systemctl stop sayso-studio
sudo systemd-run --wait --collect --unit=sayso-cre-smoke -p User=sayso -p WorkingDirectory=/opt/sayso/current -p EnvironmentFile=/etc/sayso/studio.env -p Environment=HOME=/var/lib/sayso -p Environment=PATH=/opt/sayso/bin:/usr/local/bin:/usr/bin:/bin -p MemoryMax=192M -p MemorySwapMax=0 -p CPUQuota=75% -p StandardOutput=null -p StandardError=null /bin/bash -c '
set -euo pipefail
export OPERATOR_PK= BOT_PK= DRIP_PK= REPORTER_PK=
export STUDIO_BEHIND_CADDY=true PORT=3001 STUDIO_DATA_DIR=/var/lib/sayso
/opt/sayso/bin/bun apps/studio/src/main.ts &
studio=$!
trap "kill -TERM $studio; wait $studio || true" EXIT
ready=false
for attempt in {1..30}; do
  if curl --fail --silent -H "X-Sayso-Client-IP: 127.0.0.1" http://127.0.0.1:3001/v1/time >/dev/null; then ready=true; break; fi
  sleep 1
done
$ready
cd /var/lib/sayso/resolver
/opt/sayso/bin/cre workflow simulate . --target monad-testnet --non-interactive --trigger-index 0 --evm-tx-hash "$1" --evm-event-index "$2"
' -- "$TRIGGER_TX" "$TRIGGER_LOG_INDEX"
sudo systemctl start sayso-studio
```

The smoke deliberately omits --broadcast. If it fails, keep judging traffic disabled, inspect only bounded/redacted diagnostics and memory counters, fix the actual prerequisite, then start only SAYSO. The running studio's normal CRE simulation does broadcast and requires the approved simulation receiver/reporter configuration. Do not bypass typechecking or raise the resource caps to make the smoke pass.

Require health body status=ok (HTTP 200 alone is insufficient), matching ACAO on preflight, no ACAO for unlisted origin, 206 with Content-Range and 1,024-byte range, and six 404s. Validate web deep links on Vercel and no-store PWA headers. From the permanent web origin, request a judge episode, inspect live SSE ACAO/no-store and real playback seeking at 412px, and confirm unreleased chunks return 425 without printing bodies. Watch one real CRE-settled/redeemed testnet episode and a second admitted episode. Prove IP limiting across two real client IPs: spoofing X-Sayso-Client-IP or X-Forwarded-For from the same client must not reset its on-demand/drip cooldown. Never spend keys just to fake proof.

After an episode fully drains, restart ONLY sayso-studio; verify health, SQLite recovery and a new episode. Record systemd MemoryPeak/OOM counters and gateway Docker stats while CRE compiles/runs and media is active:

```sh
sudo systemctl show sayso-studio -p MemoryCurrent -p MemoryPeak -p NRestarts -p Result
sudo cat /sys/fs/cgroup/system.slice/sayso-studio.service/memory.events
docker stats --no-stream sayso-studio-gateway-1
free -m
```

No OOM kills, increased swap or eviction of shared workloads is acceptable. B03/B05 and 5.8/8.1 remain open until actual public settlement/restart/judge proof. B06/S5 additionally need iOS Safari and Android Chrome create/sign/clear-storage/restore at the permanent RP ID. Static config validation does not close these gates.

## Upgrade and rollback

Upgrade: prepare another public release in WSL, transfer it into `/opt/sayso/releases`, wait for current episode/CRE/writers to drain, stop ONLY sayso-studio, record the old `readlink /opt/sayso/current`, back up the stopped private state/resolver to a mode-0700 directory outside all public roots, then `sudo ln -sfn /opt/sayso/releases/<new-id> /opt/sayso/current`. Refresh the writable resolver as in step 5 (replace only its source/config/tsconfig and node_modules symlink; do not delete CRE authentication), and start studio. If gateway config changed, validate it first and compose up only this gateway. Do not append a second shared site for a code upgrade.

First-deploy rollback, in the SAME shell with BACKUP retained: if no other operator edited the shared file since insertion, restore the previous complete contents to its existing inode, validate, then reload; stop ONLY SAYSO. If someone else appended a site, do NOT restore the stale backup: make a fresh candidate removing ONLY this release's BEGIN/END SAYSO block, validate it inside Caddy, and write/reload that candidate instead.

```sh
sudo cmp /opt/annona/deploy/vps/Caddyfile /tmp/sayso-complete.Caddyfile
sudo tee /opt/annona/deploy/vps/Caddyfile < "$BACKUP" > /dev/null
docker exec vps-caddy-1 caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
docker exec vps-caddy-1 caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
sudo systemctl disable --now sayso-studio
sudo docker compose --env-file /etc/sayso/gateway.env -f /opt/sayso/current/deploy/studio.compose.yaml down
```

If validation/reload fails immediately after insertion, Caddy continues its prior in-memory configuration; restore/validate/reload the backup rather than restarting. Retain private SQLite, clips, CRE auth and certificate volumes for recovery. Code rollback stops the service, switches current to the recorded old release, restores that release's resolver source/config, validates the gateway, and starts only SAYSO. Do not roll SQLite back across onchain writes: chain is truth; reconcile persisted hashes/receipts first. Never run `docker compose down` against `/opt/annona` or another project's compose file.
