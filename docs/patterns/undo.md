# Undo: the browser remembers its own posts

**Decided:** 2026-10-19, with Wallie. The About page said "Made a mistake? You can undo for 10 minutes.", but Undo was only on the confirmation screen right after logging, and a photo shared on `/photos` couldn't be removed at all. The server already allowed both: `DELETE /api/king/events/{id}` and `DELETE /api/king/photos/{id}`, with this device's `X-Reporter-Key`, within 10 minutes (404 for another device, 409 after the window).

## How the page knows which posts are its own

Reads never carry the device key, and no view returns it (`EventView`, `PhotoView`), so the browser keeps its own list: `src/king/ownPosts.ts` stores `{ id, at }` for each entry it logs and each photo it shares under `kingofwees.ownPosts`, `at` being the server's time for the post. Lately, the history log and the photo grid offer Undo / Remove on a post in that list for 10 minutes. The server still checks the key, so the list only decides where a button shows.

- **Rejected: a "yours" flag from the server.** Every read would have to send the device key, and status, history and photo pages would differ per visitor. The local list costs nothing in privacy, and loses nothing: another browser can't undo anyway (the key is per browser).
- **Rejected: matching the nickname.** Neighbors share names, and "a neighbor" is everyone who skipped.
- **Blocked storage** (private mode): the list lives in memory for the open page, as the device key does.
- **The window:** a post is undoable while the time since it is at most 10 minutes, as on the server (`now - postedAt > UndoWindow` is expired). Old records are dropped against the newest post's server time, so the device clock never decides what is kept. Shown buttons are judged by the device clock and redrawn every 30 seconds, so a button can linger a little or vanish early on a skewed clock; a 409 then says it's too late (`own.tooLate`) and the button goes.
- **Forgotten after Undo**, wherever it happened (the confirmation screen included), so no button is left on an entry that's gone.

## Asked in place

In a list a stray tap shouldn't delete, so Undo asks first ("Undo this feeding?" — Undo it / Keep it), in place like the admin's hide, never with a browser dialog. The question takes focus; Keep it puts focus back on Undo; afterwards "Your entry was undone." / "Your photo was removed." takes focus, since the buttons are gone. The confirmation screen's Undo stays one tap: that's the moment of the mistake.

## Shared photos only

A photo on an entry goes with its entry (Privacy says so); removing just that photo isn't offered (Wallie's choice). Photos shared on `/photos` get Remove, which deletes the files (30-day soft delete in storage), as undo does.
