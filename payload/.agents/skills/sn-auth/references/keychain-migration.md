# Keychain migration after an SDK upgrade

- The keychain library can change between SDK versions. On Windows, upgrading to SDK 4.3 or later dropped the Keytar store, so earlier credentials must be added again.
- Treat a migration as confirmed only when a previously working alias is missing right after an approved SDK upgrade: `Could not find stored credentials for alias: <alias>`, or `No credentials found` from a cleanly completed `auth --list`.
- Then, with the user's approval, repeat the SKILL.md setup steps ONCE to re-store the credential.
- Ordinary SDK upgrades do not automatically require reauthentication.
- If an SDK upgrade is approved, use the permitted launcher for the project's package manager and agreed version. Project-local SDKs take precedence, so a global upgrade alone does not update the local SDK.
- Do not upgrade packages as a launcher repair.
