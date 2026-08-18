startup-begin = Loading
startup-finish = Ready

preferences-pane-label = Mindmaps
preferences-heading = Link types
preferences-column-label = Label
preferences-column-directional = Directional
preferences-directional-yes = Yes
preferences-directional-no = No
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
preferences-hide-mindmap-notes = Hide the Zotero Linked Mindmaps item from my library
preferences-hide-mindmap-notes-help = Your mindmaps are stored in one Zotero item. Hiding it keeps that item out of the item list and out of search; nothing is deleted.
container-trashed-now = The Zotero Linked Mindmaps item was moved to the trash. Every mindmap in that library stays hidden until you restore it.
container-trashed-startup = The Zotero Linked Mindmaps item is in the trash. Every mindmap in that library stays hidden until you restore it.
storage-note-trashed-now = A mindmap's data note was moved to the trash. That mindmap stays hidden until you restore it.
mindmap-data-trashed-open = Mindmap data for this library is in the trash. Nothing new was created; restore it to get your mindmaps back.
itemmenu-add-to-mindmap = Add to Mindmap
itemmenu-add-link = Add Link…
itemmenu-add-link-submenu = Add Link in
add-to-mindmap-progress =
    { $count ->
        [one] Added { $count } item to { $mindmap }
       *[other] Added { $count } items to { $mindmap }
    }
