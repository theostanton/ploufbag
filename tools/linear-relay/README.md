# linear-relay

A small service, beside Cyrus on the Mac mini, that does the two bookkeeping
steps of the agent-driven process (Notion: *Agent-Driven Development — the
Ploufbag process*) so nobody has to remember them:

1. **Project status says who it is waiting on.** On every issue change in a
   project — and every 10 minutes as a safety net — it recomputes:
   - **Agent working** if Cyrus has an agent session running (or is delegated
     an issue and hasn't started one yet) on an open issue that isn't waiting
     on a person (Needs Human, or a PR In Code Review);
   - otherwise **Awaiting Human** if an issue is in Needs Human or In Code
     Review, an agent issue's session has ended while the issue is still open
     (Cyrus leaves a no-PR issue In Progress, so someone has to look and close
     it), or an open `[Human]` issue has nothing blocking it.

   The agent session decides "running", not the issue's state: an issue stays
   In Progress after Cyrus has finished with it.

   Only projects already in *Speccing*, *Agent working* or *Awaiting Human* are
   touched, so *Idea*, *Shipped* and *Canceled* are never overridden. *Speccing*
   is left alone until an agent picks up work.
2. **The next agent issue starts when its blocker is resolved.** When an issue
   moves to Done or Canceled, every `[Agent]` issue it blocks is delegated to
   Cyrus, if it is:
   - in the same project, and top level (the orchestrator delegates its own
     sub-issues);
   - not started and not already delegated;
   - not blocked by anything else still open.

   This runs on the state change only, never on the sweep, so an issue you
   deliberately undelegate stays undelegated. It relies on the blocked-by chain
   that *[Agent] Review spec for gaps* creates as its first step.

The rules are `rules.mjs`, with tests in `relay.test.mjs`:

```bash
node --test tools/linear-relay/*.test.mjs
```

It has no dependencies; Node 22 is enough.

## Configuration

`/Users/cyrus/.linear-relay.env`, readable only by `cyrus` (`chmod 600`):

```bash
LINEAR_API_KEY=lin_api_...            # personal API key; the relay acts as its owner
LINEAR_WEBHOOK_SECRET=lin_wh_...      # signing secret of the webhook below
CYRUS_USER_ID=cc237b6a-6daa-45d2-abf3-48a32fe4252f
PORT=3458
RELAY_DRY_RUN=1                       # log only; set to 0 once the log looks right
# RELAY_AUTO_DELEGATE=0               # status only, no delegation
# SWEEP_MINUTES=10                    # 0 turns the safety-net sweep off
```

It listens on `127.0.0.1` only; Tailscale Funnel is the one way in, on its own
path beside Cyrus.

## Setting it up on the Mac mini

1. **API key.** In Linear: *Settings → Account → Security & Access → Personal API
   keys → New*. Name it `linear-relay`, give it **Read** and **Write**, and limit
   it to the **Ploufbag** and **Checks** teams.
2. **Code**, as `cyrus` (`sudo -iu cyrus`):
   ```bash
   git clone --depth 1 https://github.com/theostanton/ploufbag.git ~/ploufbag-tools
   ```
3. **Funnel path**, from an admin account:
   ```bash
   sudo tailscale funnel --bg --set-path /linear-relay http://127.0.0.1:3458
   tailscale funnel status     # expect / -> :3457 (Cyrus) and /linear-relay -> :3458
   ```
4. **Webhook.** In Linear: *Settings → Administration → API → Webhooks → New
   webhook*.
   - URL: `https://mac-mini.tail1630e.ts.net/linear-relay`
   - Data change events: **Issues** only.
   - Teams: Ploufbag and Checks.

   Copy the signing secret.
5. **Env file**, as `cyrus`: write `~/.linear-relay.env` as above, with
   `RELAY_DRY_RUN=1`, then `chmod 600 ~/.linear-relay.env`.
6. **Daemon**, from an admin account:
   ```bash
   sudo cp /Users/cyrus/ploufbag-tools/tools/linear-relay/dev.theo.linear-relay.plist /Library/LaunchDaemons/
   sudo chown root:wheel /Library/LaunchDaemons/dev.theo.linear-relay.plist
   sudo launchctl bootstrap system /Library/LaunchDaemons/dev.theo.linear-relay.plist
   curl -s https://mac-mini.tail1630e.ts.net/linear-relay    # linear-relay ok
   ```
7. **Watch a dry run**, then switch it on. Change something in a project and
   read `tail -f /Users/cyrus/Library/Logs/linear-relay.log`. Expect lines
   like `[dry run] would set status …` or `[dry run] would delegate PLOUF-13 to
   Cyrus`. When they are what you would have done by hand, set
   `RELAY_DRY_RUN=0` and restart:
   ```bash
   sudo launchctl kickstart -k system/dev.theo.linear-relay
   ```

Updating: `git -C ~/ploufbag-tools pull` as `cyrus`, then the `kickstart` line.
