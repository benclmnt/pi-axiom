# pi-axiom

A [pi](https://shittycodingagent.ai) extension for querying [Axiom](https://axiom.co) logs, monitors, and debugging alerts — all from within your CLI agent.

## Onboarding

### 1. Install

**npm (published package):**
```bash
pi install npm:pi-axiom
```

**git (from a remote repository):**
```bash
pi install git:github.com/<user>/pi-axiom@v1
```

**local path (development):**
```bash
pi install /path/to/pi-axiom
# or just for a single session:
pi -e /path/to/pi-axiom
```

### 2. Create an Axiom API token

In your [Axiom](https://axiom.co) dashboard, go to **Settings → API Tokens** and create a token with **read access for all datasets and monitors**.

### 3. Configure

Run `/axiom-config` inside pi to paste your token, or set it as an environment variable:

```bash
export AXIOM_TOKEN=xapt-...
```

Optional — custom Axiom deployment URL:

```bash
export AXIOM_BASE_URL=https://axiom.yourcompany.com
```

Then reload with `/reload`.

### 4. Verify

Run `/axiom-config` again to confirm everything is working.

## Slash Commands

| Command | Description |
|---------|-------------|
| `/axiom-config` | Check status or interactively configure your Axiom API token |

## Tools

| Tool | Description |
|------|-------------|
| `axiom_list_datasets` | List datasets available to your token |
| `axiom_query_logs` | Run an APL query against any dataset |
| `axiom_list_monitors` | List all alert monitors |
| `axiom_get_monitor` | Inspect a specific monitor's config and query |
| `axiom_get_monitor_history` | View open/close history for a monitor |
| `axiom_debug_alert` | Collect monitor config + history + query results in one shot |

## Usage examples

> "List my Axiom datasets."
> "Run `['prod-logs'] | where level == 'error' | limit 20` for the last hour."
> "List my monitors and inspect the payment-errors monitor."
> "Debug why monitor `mon_XYZ` fired yesterday at 2pm."

## License

MIT
