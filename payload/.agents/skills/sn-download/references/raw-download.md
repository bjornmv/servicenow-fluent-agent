# Raw XML download (`now-sdk download`)

`now-sdk download <dir> --auth <alias>` is NOT a refresh: it only unpacks the app's raw XML into `<dir>` and changes nothing under `src/` or `metadata/`. Use it only to inspect raw XML.

- Never pass `.` or a folder inside the project; with `.` the XML lands in the project root, where the build ignores it.
- Use an empty scratch folder outside the project, and run from the project directory (the app comes from the project's `now.config.json`):
```powershell
now-sdk download "<empty-scratch-dir-outside-the-project>" --auth <alias>
```
- `--auth` works on `download` although `download --help` does not list it.
- `--incremental` requests the instance's incremental packaging mode; the CLI sends no last-download timestamp, so do not treat the result as "changes since your last download".

Return to [sn-download](../SKILL.md).
