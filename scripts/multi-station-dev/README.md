# Multi-Station Dev Networking Scripts

Scripts for setting up ethernet networking between dev laptops for multi-station
adjudication development. Based on VxPollBook's networking patterns adapted for
wired ethernet.

## Quick Start (basic networking only)

On each laptop:

```sh
sudo ./setup-ethernet-networking.sh
```

This disables NetworkManager, auto-detects the ethernet interface, and assigns
a link-local IP via avahi-autoipd. Test with:

```sh
# Machine 1:
avahi-publish-service "TestHost" _vxadmin._tcp 3002

# Machine 2:
avahi-browse -r -t _vxadmin._tcp
```

## Full Setup (with IPSec encryption + firewall)

### Step 1: Generate dev certificates (once, on any machine)

```sh
./generate-dev-certs.sh laptop1-hostname laptop2-hostname
```

Then copy the `dev-certs/` directory to all machines.

### Step 2: On each machine

```sh
sudo ./setup-ethernet-networking.sh   # networking + avahi
sudo ./setup-ipsec.sh                 # strongswan IPSec
sudo ./setup-firewall.sh              # lock down to IPSec-only traffic
```

### Verify

```sh
# Check IPSec connections
sudo swanctl --list-conns
# Ping another machine, then check for active SA
ping 169.254.x.x
sudo swanctl --list-sas
# Check firewall
sudo nft list table inet vxadmin
```

## Teardown

```sh
sudo ./teardown-firewall.sh           # remove firewall rules
sudo ./teardown-ethernet-networking.sh # restart NetworkManager
```

## Script Reference

| Script | Purpose |
|--------|---------|
| `setup-ethernet-networking.sh` | Disable NetworkManager, start avahi, assign link-local IP |
| `teardown-ethernet-networking.sh` | Undo networking setup, restart NetworkManager |
| `generate-dev-certs.sh` | Generate self-signed CA + machine certs for dev IPSec |
| `setup-ipsec.sh` | Configure strongswan for encrypted ethernet traffic |
| `setup-firewall.sh` | Lock down ethernet to IPSec + avahi only (nftables or firewalld) |
| `teardown-firewall.sh` | Remove firewall rules |

## How It Works

1. **IP assignment:** avahi-autoipd assigns 169.254.x.x link-local addresses
   (no DHCP needed). Falls back to MAC-derived static IP if autoipd fails.

2. **Service discovery:** avahi-daemon provides mDNS. The host publishes a
   `_vxadmin._tcp` service; clients browse for it.

3. **Encryption:** strongswan IPSec in transport mode encrypts all traffic on
   the 169.254.0.0/16 subnet using mutual certificate authentication.

4. **Firewall:** nftables rules drop all non-IPSec traffic on the ethernet
   interface. Only IKE negotiation, ESP, mDNS, and IPSec-decrypted application
   traffic are allowed.

## Production Differences

- Production uses TPM-backed certificates (not file-based)
- Production disables NetworkManager/firewalld at image build time
- avahi-autoipd runs as a systemd service
- Adam is handling FIPS compliance for strongswan separately
