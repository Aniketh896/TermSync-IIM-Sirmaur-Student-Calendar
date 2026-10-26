# Security policy

TermSync runs inside each student's own Google account and in its maintainer's
spreadsheet. If you find a way for one student to read or change another student's
data, to see the hidden logs without being on the SAC team, or to run admin actions,
**please don't open a public issue.**

Report it privately instead: on GitHub, open this repository's **Security** tab →
**Report a vulnerability**. Include what you did, what you could see or change, and
which version (`BUILD_ID_` near the top of `app/code.gs`).

Maintainers of a live copy: if a fix is released, update `code.gs` and `Index.html`,
Save, and deploy a new version (see [docs/CHANGING_THE_CODE.md](docs/CHANGING_THE_CODE.md)).

Never post a filled-in `config.gs`, a roster, or screenshots showing students' names
or roll numbers in an issue.
