startup-begin = Loading
startup-finish = Ready

preferences-pane-label = Mindmaps
preferences-heading = Link types
preferences-library-heading = Library
preferences-column-label = Label
preferences-column-directional = Directional
preferences-type-directional = Directional
preferences-type-undirected = Undirected
preferences-add-button = Add
preferences-edit-button = Edit
preferences-delete-button = Delete
preferences-save-button = Save
preferences-cancel-button = Cancel
preferences-field-label = Label
preferences-field-directional = Directional
preferences-delete-confirm-title = Delete link type
preferences-delete-confirm-used =
    { $count ->
        [one] Delete this link type? { $count } link uses it and will show as "(unknown type)" there.
       *[other] Delete this link type? { $count } links use it and will show as "(unknown type)" there.
    }
preferences-delete-confirm-unknown = Could not check how many links use this type: its mindmap data could not be read. Delete anyway?
preferences-hide-mindmap-notes =
    .label = Hide the Zotero Linked Mindmaps item from my library
preferences-hide-mindmap-notes-help = Your mindmaps are stored in one Zotero item. Hiding it keeps that item out of the item list and out of search; nothing is deleted.
container-trashed-now = The Zotero Linked Mindmaps item was moved to the trash. Every mindmap in that library stays hidden until you restore it.
container-trashed-startup = The Zotero Linked Mindmaps item is in the trash. Every mindmap in that library stays hidden until you restore it.
storage-note-trashed-now = A mindmap's data note was moved to the trash. That mindmap stays hidden until you restore it.
mindmap-data-trashed-open = Mindmap data for this library is in the trash. Nothing new was created; restore it to get your mindmaps back.
itemmenu-add-to-mindmap = Add to Mindmap
itemmenu-add-link = Add Link…
itemmenu-add-link-submenu = Add Link in
itemmenu-group-on-mindmap = Group Items on Mindmap…
itemmenu-group-on-mindmap-submenu = Group Items on Mindmap
add-to-mindmap-progress =
    { $count ->
        [one] Added { $count } item to { $mindmap }
       *[other] Added { $count } items to { $mindmap }
    }
group-on-mindmap-dialog-title = Group items
group-on-mindmap-dialog-message = Name for the group (optional)
group-on-mindmap-progress =
    { $count ->
        [one] Grouped { $count } item on { $mindmap }
       *[other] Grouped { $count } items on { $mindmap }
    }
group-on-mindmap-skipped =
    { $count ->
        [one] { $count } item was left out: only items and notes can be grouped.
       *[other] { $count } items were left out: only items and notes can be grouped.
    }
