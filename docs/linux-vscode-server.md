# Linux and VS Code server (code serve-web)

The agent also runs on Linux in a bash terminal. That covers desktop VS Code on Linux and a VS Code server: `code serve-web` in a browser, Remote-SSH, or a dev container. Windows remains the primary target. Skill helpers run as `sn-skill <name> <arguments>`, the same text in both shells; only a few `now-sdk` build and install steps add a `bash` variant.

The [agent-assisted setup guide](../setup.md) is Windows-only (MinGit, PowerShell workers). On Linux, use the steps below instead.

## Prerequisites

- Node.js 20.18 or later (24.14.1 or later for the Lux/AIUX skills), npm and Git from the distribution.
- `now-sdk` installed globally: `npm i -g @servicenow/sdk@<version>`.
- A **Secret Service** for now-sdk OAuth credentials, such as gnome-keyring on a D-Bus session. now-sdk stores tokens through `@napi-rs/keyring`. Without a Secret Service, `auth --add` either fails or keeps the token only until restart, and `sn-rest` reports `Platform secure storage failure`. A container needs `dbus-daemon --session` and an unlocked `gnome-keyring-daemon --components=secrets` started before VS Code, with `DBUS_SESSION_BUS_ADDRESS` inherited by the terminals. Never mount the host's session bus into a container.

## Install

Run this from a terminal on the machine where VS Code's extension host runs. For serve-web or Remote, that is the integrated terminal.

```bash
git clone https://github.com/bjornmv/servicenow-fluent-agent.git
cd servicenow-fluent-agent
node bin/sn-fluent-agent.cjs install
```

On Linux and macOS, the installer:

- copies the payload to `~/.copilot/agents` and `~/.agents/...`, the same as on Windows;
- adds a managed `now-sdk` shell function to `~/.bashrc`, between `# >>> servicenow-fluent-agent now-sdk >>>` markers. It has the same precedence as the Windows **PowerShell with now-sdk** profile: the project's `node_modules/@servicenow/sdk` first, then the global SDK. Open a new terminal and check that `type now-sdk` reports a function. `--no-shell-function` skips this step;
- patches the VS Code settings file:
  - **Desktop VS Code:** `~/.config/Code/User/settings.json` (or `$XDG_CONFIG_HOME/Code/User`); on macOS `~/Library/Application Support/Code/User`.
  - **VS Code server / serve-web:** User settings are stored in the browser, so no file on the server can hold them. Point the installer at the server's **Machine** settings instead: `--settings-file <server-data-dir>/data/Machine/settings.json`, or set `SN_FLUENT_VSCODE_SETTINGS` to that path so later updates find it too. For `code serve-web --server-data-dir /data/server`, the file is `/data/server/data/Machine/settings.json`.

The settings use the home-relative forms VS Code documents (`~/.copilot/agents`, `~/.agents/instructions`, `~/.agents/skills` under `chat.agentSkillsLocations`) next to the absolute paths. Reload the browser window or VS Code after installing.

## Connect your PDI

Run `now-sdk auth --add <instance> --type oauth --alias <alias>` in the terminal. On a server, no browser opens on the server: open the printed URL in your own browser, approve the request, and paste the code into the waiting terminal. now-sdk 4.13.6 needs no localhost callback.

## Documentation lookup

The default location is `$XDG_DATA_HOME/SNDocs/{repo,index}`, or `~/.local/share/SNDocs/...`. To reuse an existing ServiceNowDocs checkout, set `SN_DOCS_HOME` to its branch root (the folder containing `markdown/`). Set `SN_DOC_MD_INDEX` for a separate index location.

## Browsers and dev servers

- The doc-export and screenshot skills use an installed Chrome, Chromium or Edge (`SN_DOC_BROWSER` overrides the choice). On Linux the browser search also covers `PATH` and `/opt`. In a container, Chrome needs `--no-sandbox` as root and a larger `/dev/shm`. `Target closed` or missing `.so` errors mean missing Chrome system libraries.
- To set `SN_DOC_BROWSER` for every terminal, use `terminal.integrated.env.linux` in VS Code settings.
- In a container, keep the global npm folder (renderer packages) on a persisted volume or bake it into the image.
- On a server, `http://localhost:<port>` from a dev server is local to the server. Forward the port (VS Code Ports view, `ssh -L`) or check in a browser on the server. Do not bind dev servers to `0.0.0.0` without approval.

## Update and uninstall

`git pull`, then run the same `install` command. `node bin/sn-fluent-agent.cjs uninstall` removes unchanged payload files and the `~/.bashrc` block. Remove the `chat.*` keys from the settings file by hand, and delete stored credentials with `now-sdk auth --delete <alias>`.
