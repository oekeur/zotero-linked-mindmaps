# Reporting a bug or requesting a feature

The plugin's settings pane has two buttons that open the project's issue forms
on GitHub. Both are under Edit, then Settings, then Mindmaps, in the Feedback
section at the bottom.

## Report a bug

"Report a bug…" opens the bug form in your browser with four fields already
filled in:

- your plugin version
- your Zotero version
- your operating system
- the plugin's recent error messages

You still write what happened and how to reproduce it. Those are the parts
nobody else can supply.

Nothing is sent when you press the button. The button only opens a form, and the
report goes nowhere until you press Submit on GitHub. Every field stays editable
until then, so you can read what was collected and change or delete any of it.

You need a GitHub account to file an issue. If you are not signed in, GitHub
asks you to sign in first and then returns you to the form with the fields still
filled in.

### What ends up in the error messages

Only messages this plugin logged itself. Zotero keeps one error log shared by
everything running inside it, and the button filters that down to the plugin's
own entries, so failures from other plugins and from Zotero itself stay out of
the report.

Zotero keeps the 25 most recent errors and no more. If the failure happened a
while ago, or a lot has gone wrong since, it may already have been pushed out.
Reporting soon after you see the problem gets the most useful log.

If the errors are long, the oldest are dropped so the rest fit in the URL, and
the report says where that happened. The full log is always available in Zotero
under Help, then Report Errors, which opens a window you can copy from without
sending anything to Zotero.

If the plugin has logged nothing, the error field arrives empty. That is
ordinary: plenty of bugs never raise an error, and an empty field is not a
problem with your report.

## Request a feature

"Request a feature…" opens the feature form. It collects nothing from your
Zotero, because a feature request does not need it.

The most useful part of that form is what you tried instead. Tags, related
items, a note, another plugin, and why each fell short.

## Filing without the buttons

The forms work on their own if you would rather not use the buttons, or if
Zotero will not start:

- [Report a bug](https://github.com/oekeur/zotero-linked-mindmaps/issues/new?template=bug_report.yml)
- [Request a feature](https://github.com/oekeur/zotero-linked-mindmaps/issues/new?template=feature_request.yml)

Filling in the version and error fields by hand is then up to you. Help, then
About Zotero gives the Zotero version; Tools, then Plugins gives the plugin
version.
