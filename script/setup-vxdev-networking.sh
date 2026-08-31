#!/usr/bin/env bash

###
# setup-vxdev-networking.sh — configure a VxDev laptop for local ethernet
# networking (VxCentralScan → VxAdmin CVR sync) the way production admin
# machines are configured, while keeping NetworkManager + wifi usable for
# development.
#
# Mirrors the production trusted build:
#   - systemd-networkd manages ethernet with link-local addressing only
#     (vxsuite-build-system/playbooks/trusted_build/files/10-ethernet.network)
#   - strongSwan IKEv2 transport-mode IPsec, trap-installed for
#     169.254.0.0/16 <-> 169.254.0.0/16, pubkey auth against the VotingWorks
#     CA (vxsuite-build-system/playbooks/trusted_build/files/vxswan.conf)
#   - $VX_CONFIG_ROOT/local-ethernet-state gates networking in the apps
#
# Test-bench deviations from production (each noted inline):
#   - The IPsec key is a file, signed by the DEV VotingWorks CA, instead of a
#     TPM-held AK certified by VxCertifier (run
#     complete-system/config/vendor-functions/{generate-key,create-machine-cert}.sh
#     on a QA image for the real flow; production only provisions admin and
#     poll-book strongswan certs today).
#   - NetworkManager stays running for wifi; only the ethernet interface is
#     handed to systemd-networkd. Production has no NetworkManager.
#   - avahi is blocked from the wifi interface so discovery always resolves
#     the link-local ethernet address. Production machines have no wifi.
#   - firewalld and charon FIPS mode are not enabled (the former would cut
#     off wifi ssh; the latter requires the openssl FIPS provider).
#
# Usage (on the laptop, from anywhere inside the vxsuite checkout):
#   sudo ./script/setup-vxdev-networking.sh [--machine-id NNNN]
###

set -euo pipefail

if [[ $EUID -ne 0 ]]; then
  echo "run with sudo" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VXSUITE_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
DEV_CERTS_DIR="${VXSUITE_ROOT}/libs/auth/certs/dev"
VX_CONFIG_ROOT="${VX_CONFIG_ROOT:-/vx/config}"

MACHINE_ID_ARG=""
if [[ "${1:-}" == "--machine-id" ]]; then
  MACHINE_ID_ARG="${2:?--machine-id requires a value}"
fi

# ---------------------------------------------------------------------------
# Machine identity
# ---------------------------------------------------------------------------

raw_machine_type="$(cat "${VX_CONFIG_ROOT}/machine-type" 2>/dev/null || true)"
case "${raw_machine_type}" in
  admin | VxAdmin) machine_type="admin" ;;
  central-scan | VxCentralScan) machine_type="central-scan" ;;
  *)
    echo "Unsupported machine type '${raw_machine_type}' in ${VX_CONFIG_ROOT}/machine-type" >&2
    echo "(expected admin/VxAdmin or central-scan/VxCentralScan)" >&2
    exit 1
    ;;
esac

if [[ -n "${MACHINE_ID_ARG}" ]]; then
  echo "${MACHINE_ID_ARG}" > "${VX_CONFIG_ROOT}/machine-id"
fi
machine_id="$(cat "${VX_CONFIG_ROOT}/machine-id" 2>/dev/null || echo 0000)"
if [[ "${machine_id}" == "0000" ]]; then
  echo "WARNING: machine-id is the default 0000. Every VxDev machine defaults to" >&2
  echo "0000 and duplicate IDs make VxAdmin's scanner status flicker; rerun with" >&2
  echo "--machine-id NNNN to set a unique one." >&2
fi
echo "Configuring ${machine_type} machine ${machine_id}"

# ---------------------------------------------------------------------------
# Interfaces: first wired = vxnet, wifi stays with NetworkManager
# ---------------------------------------------------------------------------

eth_interface="$(nmcli -t -f DEVICE,TYPE device 2>/dev/null | awk -F: '$2 == "ethernet" { print $1; exit }')"
wifi_interface="$(nmcli -t -f DEVICE,TYPE device 2>/dev/null | awk -F: '$2 == "wifi" { print $1; exit }')"
if [[ -z "${eth_interface}" ]]; then
  echo "No ethernet interface found (nmcli device); plug one in first" >&2
  exit 1
fi
echo "ethernet: ${eth_interface}   wifi: ${wifi_interface:-<none>}"

# ---------------------------------------------------------------------------
# Packages (the production networking set, from
# vxsuite-build-system/inventories/latest/group_vars/all/networking.yaml)
# ---------------------------------------------------------------------------

apt-get install -y \
  avahi-daemon avahi-utils avahi-autoipd \
  strongswan-swanctl libstrongswan-extra-plugins libstrongswan-standard-plugins \
  charon-systemd strongswan-pki

# ---------------------------------------------------------------------------
# IPsec key + cert, signed by the dev VotingWorks CA
# (test-bench deviation: production admin keys live in the TPM)
# ---------------------------------------------------------------------------

swan_cert="/etc/swanctl/x509/vx-${machine_type}-strongswan-rsa-cert.pem"
swan_key="/etc/swanctl/private/vx-${machine_type}-strongswan-key.pem"

if [[ ! -f "${swan_cert}" ]]; then
  csr="$(mktemp)"
  openssl req -new -newkey rsa:2048 -nodes \
    -keyout "${swan_key}" \
    -subj "/C=US/ST=CA/O=VotingWorks/CN=Vx-${machine_type}-${machine_id}" \
    -out "${csr}"
  openssl x509 -req -in "${csr}" \
    -CA "${DEV_CERTS_DIR}/vx-cert-authority-cert.pem" \
    -CAkey "${DEV_CERTS_DIR}/vx-private-key.pem" \
    -CAcreateserial -days 365 \
    -out "${swan_cert}"
  rm -f "${csr}"
  chmod 600 "${swan_key}"
fi
cp "${DEV_CERTS_DIR}/vx-cert-authority-cert.pem" /etc/swanctl/x509ca/vx-cert-authority-cert.pem

# ---------------------------------------------------------------------------
# strongSwan connection config. Identical policy to the production
# trusted_build vxswan.conf; only the cert name is parameterized and the
# secrets block references the file key instead of TPM handle 0x81010003.
# ---------------------------------------------------------------------------

cat > /etc/swanctl/conf.d/vxswan.conf <<EOF
connections {
  vxswan {
    version = 2
    local_addrs = %any
    remote_addrs = %any

    local {
      certs = vx-${machine_type}-strongswan-rsa-cert.pem
      auth = pubkey
    }

    remote {
      id = %any
      auth = pubkey
    }

    send_cert=always
    send_certreq=yes

    children {
      net {
        local_ts = 169.254.0.0/16
        remote_ts = 169.254.0.0/16
        start_action = trap
        dpd_action = restart
        mode = transport
      }
    }
  }
}

secrets {
  private_rsa {
    file = vx-${machine_type}-strongswan-key.pem
  }
}

authorities {
  votingworks {
    cacert = vx-cert-authority-cert.pem
  }
}
EOF

systemctl enable --now strongswan
swanctl --load-all

# ---------------------------------------------------------------------------
# Ethernet: link-local only via systemd-networkd (verbatim production config)
# ---------------------------------------------------------------------------

cat > /etc/systemd/network/10-ethernet.network <<EOF
[Match]
Type=ether

[Network]
LinkLocalAddressing=yes
EOF

# Production toggles systemd-networkd through oneshot-local-ethernet.service +
# manage-local-ethernet.sh reading local-ethernet-state; on the test bench we
# enable it directly and write the state file the apps read.
systemctl enable --now systemd-networkd
echo enable > "${VX_CONFIG_ROOT}/local-ethernet-state"

# Keep NetworkManager off the ethernet interface (wifi is untouched)
mkdir -p /etc/NetworkManager/conf.d
cat > /etc/NetworkManager/conf.d/99-vxnet.conf <<EOF
[keyfile]
unmanaged-devices=interface-name:${eth_interface}
EOF
systemctl restart NetworkManager || true

# ---------------------------------------------------------------------------
# avahi: never advertise the wifi address, so discovery resolves the
# link-local ethernet address and app traffic rides the IPsec'd wire
# ---------------------------------------------------------------------------

if [[ -n "${wifi_interface}" ]]; then
  if grep -q '^deny-interfaces=' /etc/avahi/avahi-daemon.conf; then
    sed -i "s/^deny-interfaces=.*/deny-interfaces=${wifi_interface}/" /etc/avahi/avahi-daemon.conf
  else
    sed -i "s/^\[server\]/[server]\ndeny-interfaces=${wifi_interface}/" /etc/avahi/avahi-daemon.conf
  fi
fi
systemctl enable --now avahi-daemon
systemctl restart avahi-daemon

# ---------------------------------------------------------------------------
# Report
# ---------------------------------------------------------------------------

echo
echo "Done. Waiting for a link-local address on ${eth_interface}…"
for _ in $(seq 1 15); do
  address="$(ip -4 -o addr show "${eth_interface}" | awk '{ print $4 }')"
  [[ -n "${address}" ]] && break
  sleep 1
done
echo "  ${eth_interface}: ${address:-NO ADDRESS YET (is the cable plugged into the switch?)}"
echo "  swanctl conns:"
swanctl --list-conns | sed -n '1,4p'
echo
echo "Verify against the peer machine:"
echo "  ping <peer 169.254 address>        # first packet triggers the IKE handshake"
echo "  sudo swanctl --list-sas            # expect a transport-mode child SA"
echo "  sudo tcpdump -ni ${eth_interface} esp"
