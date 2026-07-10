# Time Machine auto-reconnect fix: Bonjour advertisement across VLANs

**Date:** 2026-07-10
**Status:** Approved
**Machines involved:** MacBook Pro (192.168.2.x VLAN), brok / Unraid 7.3.0 (192.168.5.10), UniFi gateway (192.168.2.1)

## Problem

Time Machine backs up to an SMB share on brok (`smb://jason@smb.jasonmatthew.me/timemachine`). After a network disruption (e.g. taking the MacBook to the office), Time Machine stops attempting backups entirely until the share is manually mounted in Finder. Backups silently stall for hours or days.

## Diagnosis (from logs and live inspection, 2026-07-10)

- **Credentials and mounting are fine.** The "Time Machine Network Password" exists in the system keychain, and backupd successfully mounted the share unattended at 16:46 and 19:50 today. The manual Finder mount is not supplying anything backupd lacks.
- **The wake-up signal is what's missing.** After repeated failures, backupd stops blind-retrying and waits for a Bonjour "destination appeared" event. Evidence: a 3-hour gap (16:50 → 19:50) with zero mount attempts after a `BACKUP_FAILED_DISCONNECTED_NETWORK (26)`.
- **That event can never arrive**, for two independent reasons:
  1. The destination is a plain DNS name (`smb.jasonmatthew.me` → 192.168.5.10), not a Bonjour name. Confirmed just a convenience name — nothing (VPN, remote backup) depends on TM using it.
  2. avahi is not running on brok, no `_adisk._tcp`/`_smb._tcp` advertisement exists (the share is hand-rolled in `/boot/config/smb-extra.conf`, so Unraid never generated one), and the Mac and brok are on different VLANs with no mDNS reflection on the UniFi gateway. `dns-sd -B _adisk._tcp local.` from the Mac sees nothing.
- The manual Finder mount "fixes" it because mounting the share manufactures the destination-available event.

## Chosen approach

Native Unraid Time Machine export + UniFi mDNS reflection + re-point the Mac at the Bonjour name. (Rejected: hand-maintained avahi service file on brok — fragile across Unraid upgrades since rootfs is RAM-backed; Mac-side watchdog LaunchAgent — treats the symptom, kept as a future option if mDNS reflection ever silently breaks.)

## Design

### 1. brok (Unraid 7.3): native Time Machine export

- Back up `/boot/config/smb-extra.conf`, then remove its `[timemachine]` section.
- In the Unraid web UI, share `timemachine` → SMB settings: Export = **Yes (Time Machine)**, Time Machine volume size limit = 2 TB, Security = **Private**, `jason` = read/write. This reproduces the current effective config (`valid users = jason`, `fruit:time machine max size = 2T`); note the share cfg currently says `shareSecurity="public"` and was only restricted by the smb-extra section.
- Unraid generates the fruit/Samba config and `/etc/avahi/services/timemachine.service` natively and persistently.
- Verify avahi is running afterward (it is currently stopped); if the TM export doesn't start it, diagnose and fix that as part of this step.
- Share-level SMB settings do not require stopping the array. Share contents (existing sparsebundle) are untouched.

### 2. UniFi: mDNS reflection across VLANs

- Enable Multicast DNS for both the Mac's network (192.168.2.0/24) and the server VLAN (192.168.5.0/24) in the UniFi console.
- Accepted trade-off: reflection is service-agnostic, so other discovery chatter (Chromecast, AirPlay, …) also crosses between these two VLANs.

### 3. Mac: re-point Time Machine at the Bonjour name

- Wait for any in-progress backup to finish.
- Mount `smb://jason@brok.local/timemachine` once in Finder (stores the credential for the new server name).
- `sudo tmutil setdestination -a /Volumes/timemachine`, then `sudo tmutil removedestination 08BB7E8F-078B-4D1E-98A8-E8719B1FB6D3` (the old `smb.jasonmatthew.me` destination).
- Same share + same machine name → Time Machine reuses `Jason's MacBook Pro.sparsebundle`; backup history continues, nothing is re-uploaded.
- `smb.jasonmatthew.me` DNS keeps existing for other uses.

### 4. Validation (in order) and rollback

1. On brok: `/etc/avahi/services/timemachine.service` exists; `avahi-browse -rt _adisk._tcp` shows the advert locally.
2. On the Mac: `dns-sd -B _adisk._tcp local.` shows Brok — cross-VLAN proof.
3. `tmutil destinationinfo` shows the `brok.local` URL; a manual `tmutil startbackup` completes into the **existing** sparsebundle (confirmed in backupd log, not by absence of errors).
4. Recovery test: disable Wi-Fi long enough for TM to register the destination as gone, re-enable, and confirm backupd remounts and backs up with zero Finder involvement (watch `log stream` for the TimeMachine subsystem).

Rollback per layer: restore `smb-extra.conf` from backup and revert the share's SMB settings; flip the UniFi mDNS toggle back; `tmutil setdestination` back to the old URL.

## Out of scope (follow-up)

**Mid-backup SMB drops** — two today (16:50, 21:01) even while on the home network. Prime suspect: the sparsebundle is split across cache (14G) and array (642G) with hourly Mover Tuning activity; cross-VLAN session timeout on the gateway is the secondary suspect. If drops continue after this fix: set the share to `Use cache: No` so mover never touches it, then investigate UniFi flow timeouts.
