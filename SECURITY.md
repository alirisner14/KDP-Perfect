# Security policy

## Supported versions

Only the latest release receives security fixes while the project is pre-1.0.

## Reporting a vulnerability

Please **do not open a public issue** for security problems.

Use GitHub's [private vulnerability reporting](https://github.com/alirisner14/KDP-Perfect/security/advisories/new) (Security tab → *Report a vulnerability*). If that isn't available, contact the repository owner privately through their GitHub profile.

Include the affected version, steps to reproduce, and the impact. You can expect an acknowledgement within a few days and a fix or mitigation plan as soon as practical. We're happy to credit you in the release notes unless you prefer otherwise.

## Scope and design

KDP Perfect has no server, no accounts and no network access. Its attack surface is the desktop shell and the file-saving bridge:

- The page runs with `contextIsolation`, `sandbox`, no Node integration and a strict Content-Security-Policy.
- The only privileged call is `saveFile`: the main process validates the sender, restricts file names to a base name with an allow-listed extension, bounds the size, and the user picks the destination in a native dialog.
- Navigation away from the app is blocked; external links open in the system browser.
- All input is numeric form data; there is no user-supplied HTML, and no uploaded files in v0.1.

When the Word-document import ships (see the [roadmap](docs/ROADMAP.md)), parsing untrusted `.docx` files becomes part of the threat model (zip bombs, XML entity expansion, embedded content). That work will include its own review.

Reports about the Electron framework or third-party dependencies are best sent upstream, but tell us if our configuration makes an issue exploitable.
