# ADSBHub setup for Skyward

Status: prepared, **not installed or activated**. No receiver or account exists
for this setup yet. Nothing in this directory purchases hardware, registers an
account, uploads observations, or changes the running Skyward server.

## 1. Receiver at a suitable physical location

You need a 1090 MHz ADS-B-capable USB SDR, matching antenna/cable, and an always-on
Linux computer (a Raspberry Pi or existing small computer). The antenna needs
an appropriate view of the sky. Choose hardware compatible with your host and
decoder before buying; this is a requirements list, not a purchase order. A cloud
server or a machine without radio hardware cannot substitute for this receiver.

Install a maintained decoder such as [readsb](https://github.com/wiedehopf/readsb)
or follow the [Ultrafeeder setup](https://github.com/sdr-enthusiasts/docker-adsb-ultrafeeder).
Use the decoder's instructions for USB access, antenna coordinates and altitude.
Set the receiver clock correctly and arrange SBS output on local TCP port 30003.
Do not expose that port publicly. Keep incoming aggregated feeds separate from
this decoder: only your receiver's own data should be contributed to ADSBHub.

On the receiver host, from a copy of this repository with Node 24 installed:

```sh
node web/scripts/check-adsbhub.mjs --local
```

A PASS requires recent position messages with plausible UTC generated times.
NOT_READY can mean no radio coverage, incorrect output port, missing position
messages, or a clock/timezone mismatch. Fix those before feeding. A decoder may
still be working with only a few aircraft; inspect its local map/logs too.

## 2. Register your account and station

Use [ADSBHub registration](https://www.adsbhub.org/register.php) and complete the
email verification yourself. Keep the password and station key private.

In Settings → New Station, enter your real station name, location, antenna
latitude/longitude, receiver type, **SBS** protocol, and **Client** mode. Set the
station host/IP to the receiver site's public outgoing IP or supported dynamic
DNS hostname. Do not use its private LAN IP or your SSH-forwarded localhost.
The location is where the antenna actually is, not the Skyward server location.
Review what station information will be public before submitting.

In the profile's **Data Access** section, add the public outgoing IP of the
Skyward application server. This can differ from the receiver IP. Account
creation, email confirmation and these values cannot be filled in by the code.
If addresses change, update the station/profile or use the provider's documented
dynamic-IP client. This static-IP relay does not manage the station ckey.

## 3. Send local receiver observations

ADSBHub's documented client upload is `data.adsbhub.org:5001`. Aggregated data is
received separately from port **5002**. Do not send the aggregate back to port
5001 as if it were your own station.

The included systemd unit forwards only `127.0.0.1:30003`, handles backpressure,
and reconnects after errors. On the **receiver host**, after its registration and
successful local check:

```sh
sudo apt-get update
sudo apt-get install socat
sudo install -m 644 ops/adsbhub/skyward-adsbhub-feeder.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now skyward-adsbhub-feeder
systemctl status skyward-adsbhub-feeder
journalctl -u skyward-adsbhub-feeder -n 30
```

Verify incoming observations for your station on ADSBHub's Statistics page.
A running local service alone does not prove the provider is receiving data.
Allow outgoing TCP 5001 from the receiver and outgoing TCP 5002 from Skyward;
client mode does not require opening inbound Internet ports.

## 4. Check aggregate access on the Skyward server

Only after the station is contributing and the server IP is authorized:

```sh
SKYWARD_ADSBHUB_ACCESS=confirmed node web/scripts/check-adsbhub.mjs --hub
```

The checker uses one connection for at most 20 seconds, reports counts only,
and never sets activation flags for you. A TCP connection alone is insufficient:
verify recent valid position messages and correct UTC generated timestamps.
If the provider's stream timestamps are not UTC, leave the adapter disabled
until its timestamp handling is adapted and tested.

## 5. Enable and verify Skyward

Add these to the server process environment only after the preceding checks:

```sh
SKYWARD_ADSBHUB_ENABLED=1
SKYWARD_ADSBHUB_ACCESS=confirmed
SKYWARD_ADSBHUB_TIMESTAMPS=UTC
```

Use the existing server launcher/environment mechanism; copying `.env.example`
does not by itself make Node load it. Restart Skyward yourself once. Check
`/api/feed-sources` for `adsbhub`, then open the map and Connection health. Look
for two configured sources responding and compare aircraft in several regions.
Coverage improvements are not guaranteed merely by connecting another network.

Rollback: set `SKYWARD_ADSBHUB_ENABLED=0` and restart Skyward. To stop contributing,
run `sudo systemctl disable --now skyward-adsbhub-feeder` on the receiver host;
aggregate access may then be withdrawn under the provider's terms.

## Validation performed without hardware

`node web/scripts/check-adsbhub.mjs --self-test` exercises the timestamp parser
without network traffic. Stream fragmentation, timestamps, connection shutdown,
source merge and outage behavior are covered by
`node --test web/server/combined-feed.test.mjs`. Real reception, submission,
account access and aggregate service availability remain unverified.

Sources: [ADSBHub feeding instructions](https://www.adsbhub.org/howtofeed.php),
[aggregate-access requirements](https://www.adsbhub.org/howtogetdata.php).
