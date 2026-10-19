# Keychain migration after an SDK upgrade

- The keychain library can change between SDK versions. On Windows, upgrading to SDK 4.3 or later dropped the Keytar store, so earlier credentials must be added again.
- On Linux, first rule out an unreadable store: the SDK reports a broken Secret Service as `No credentials found` (exit 0), and a keyutils-only copy without Secret Service is lost on reboot or container restart. An sn-rest call with no API path should print alias metadata, not `Platform secure storage failure`; otherwise report a host finding ([Linux notes](../../../reference/sdk-commands.md#linux-and-vs-code-server-bash)).
- Treat a migration as confirmed only when a previously working alias is missing right after an approved SDK upgrade: `Could not find stored credentials for alias: <alias>`, or `No credentials found` from a cleanly completed `auth --list`.
- Then, with the user's approval, repeat the SKILL.md setup steps ONCE to re-store the credential.
- Ordinary SDK upgrades do not automatically require reauthentication.
- If an SDK upgrade is approved, use the permitted launcher for the project's package manager and agreed version. Project-local SDKs take precedence, so a global upgrade alone does not update the local SDK.
- Do not upgrade packages as a launcher repair.
