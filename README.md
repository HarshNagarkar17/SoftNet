# SoftNet

A fast desktop HTTP client. Paste a cURL command into the URL bar, or build the request by hand, and send it.

Collections, environments, history, open tabs, and preferences are saved in a `.softnet` folder in the project root (`workspace.json`, `environments.json`, `history.json`, `tabs.json`, `prefs.json`). Import a Postman collection or environment from the sidebar. Use `{{name}}` in a URL, header, auth field, or body. Collection variables live on each collection; the active environment overrides them.

## Run in development

```bash
npm install
npm run tauri dev
```

## Build the desktop app

```bash
npm run tauri build
```

The installers land in `src-tauri/target/release/bundle/`: `macos/SoftNet.app` and `dmg/` on macOS, `msi/` and `nsis/` on Windows, `deb/`, `rpm/` and `appimage/` on Linux. Build on the platform you are targeting.

To try it against a local API, run `node scripts/mock-server.mjs` and send to `http://localhost:4010/users`.

Shortcuts: `Cmd/Ctrl+Enter` send, `Cmd/Ctrl+S` save, `Cmd/Ctrl+T` new tab, `Cmd/Ctrl+L` focus URL, `Cmd/Ctrl+F` search response, `Cmd/Ctrl+B` toggle sidebar.
