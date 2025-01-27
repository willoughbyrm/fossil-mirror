# Fossil Chat

## Introduction

As of version 2.14,
Fossil supports a developer chatroom feature.  The chatroom provides an
ephemeral discussion venue for insiders.  Design goals include:

  *  **Simple but functional** &rarr; Fossil chat is designed to provide a
     convenient real-time communication mechanism for geographically
     dispersed developers.  Fossil chat is *not* intended
     as a replacement or 
     competitor for IRC, Slack, Discord, Telegram, Google Hangouts, etc.

  *  **Low administration** &rarr;
     You can activate the chatroom in seconds without having to
     mess with configuration files or install new software.
     In an existing [server setup](./server/),
     simply enable the [C capability](/setup_ucap_list) for users
     whom you want to give access to the chatroom.

  *  **Ephemeral** &rarr;
     Chat messages do not sync to peer repositories, and they are
     automatically deleted after a configurable delay (default: 7 days).
     Individual messages or the entire conversation
     can be deleted at any time without impacting any other part
     of the system.

Fossil chat is designed for use by insiders - people with check-in
privileges or higher.  It is not intended as a general-purpose gathering
place for random passers-by on the internet. 
Fossil chat seeks to provide a communication venue for discussion
that does *not* become part of the permanent record for the project.
For persistent and durable discussion, use the [Forum](./forum.wiki).
Because the conversation is intended to be ephemeral, the chat messages
are local to a single repository.  Chat content does not sync.


## Setup

A Fossil repository must be functioning as a [server](./server/) in order
for chat to work.
To activate chat, simply add the [C capability](/setup_ucap_list)
to every user who is authorized to participate.  Anyone who can read chat
can also post to chat.

Setup ("s") and Admin ("a") users always have access to chat, without needing
the "C" capability.  A common configuration is to add the "C" capability
to "Developer" so that any individual user who has the "v" capability will
also have access to chat.

There are also some settings under /Admin/Chat that control the
behavior of chat, though the default settings are reasonable so in most
cases those settings can be ignored.  The settings control things like
the amount of time that chat messages are retained before being purged
from the repository database.

## Usage

For users with appropriate permissions, simply browse to the
[/chat](/help?cmd=/chat) to start up a chat session.  The default
skin includes a "Chat" entry on the menu bar on wide screens for
people with chat privilege.  There is also a "Chat" option on
the [Sitemap page](/sitemap), which means that chat will appear
as an option under the hamburger menu for many [skins](./customskin.md).

Message text is delivered verbatim.  There is no markup.  However,
the chat system does try to identify and tag hyperlinks, as follows:

  *  Any word that begins with "http://" or "https://" is assumed
     to be a hyperlink and is tagged.

  *  Text within `[...]` is parsed, and it if is a valid hyperlink
     target (according to the way that [Fossil Wiki](/wiki_rules) or
     [Markdown](/md_rules) understand hyperlinks), then that text is
     tagged. Note that only URLs and Fossil-internal constructs such
     as checkin hashes and wiki pages names are recognized here, not
     constructs such as `[URL | label]` or `[label](URL)`.

Apart from adding hyperlink anchor tags to bits of text that look
like hyperlinks, no changes are made to the input text.

Files may be sent via chat using the file selection element at the
bottom of the page. If the desktop environment system supports it,
files may be dragged and dropped onto that element. Files are not
automatically sent - selection of a file can be cancelled using the
Cancel button which appears only when a file is selected. When the
Send button is pressed, any pending text is submitted along with the
selected file. Image files sent this way will, by default, appear
inline in messages, but each user may toggle that via the settings
popup menu, such that images instead appear as downloadable links.
Non-image files always appear in messages as download links.

### Deletion of Messages

Any user may *locally* delete a given message by clicking on the "tab"
at the top of the message and clicking the button which appears. Such
deletions are local-only, and the messages will reappear if the page
is reloaded. The user who posted a given message, or any Admin users,
may additionally choose to globally delete a message from the chat
record, which deletes it not only from their own browser but also
propagates the removal to all connected clients the next time they
poll for new messages.

## Implementation Details

*You do not need to understand how Fossil chat works in order to use it.
But many developers prefer to know how their tools work.
This section is provided for the benefit of those curious developers.*

The [/chat](/help?cmd=/chat) webpage downloads a small amount of HTML
and a small amount of javascript to run the chat session.  The
javascript uses XMLHttpRequest (XHR) to download chat content, post
new content, or delete historical messages.  The following web
interfaces are used by the XHR:

  *  **/chat-poll** &rarr;
     Downloads chat content as JSON.
     Chat messages are numbered sequentially.
     The client tells the server the largest chat message it currently
     holds, and the server sends back subsequent messages.  If there
     are no subsequent messages, the /chat-poll page blocks until new
     messages are available.

  *  **/chat-send** &rarr;
     Sends a new chat message to the server.

  *  **/chat-delete** &rarr;
     Deletes a chat message.

Fossil chat uses the venerable "hanging GET" or 
"[long polling](wikipedia:/wiki/Push_technology#Long_polling)"
technique to recieve asynchronous notification of new messages.
This is done because long polling works well with CGI and SCGI,
which are the usual mechanisms for setting up a Fossil server.
More advanced notification techniques such as 
[Server-sent events](wikipedia:/wiki/Server-sent_events) and especially
[WebSockets](wikipedia:/wiki/WebSocket) might seem more appropriate for
a chat system, but those technologies are not compatible with CGI.

Downloading of posted files and images uses a separate, non-XHR interface:

  * **/chat-download** &rarr;
    Fetches the file content associated with a post (one file per
    post, maximum). In the UI, this is accessed via links to uploaded
    files and via inlined image tags.

Chat messages are stored on the server-side in the CHAT table of
the repository.

~~~
   CREATE TABLE repository.chat(
      msgid INTEGER PRIMARY KEY AUTOINCREMENT,
      mtime JULIANDAY,
      ltime TEXT,
      xfrom TEXT,
      xmsg  TEXT,
      fname TEXT,
      fmime TEXT,
      mdel  INT,
      file  BLOB)
    );
~~~

The CHAT table is not cross-linked with any other tables in the repository
schema.  An administrator can "DROP TABLE chat;" at any time, without
harm (apart from deleting all chat history, of course).  The CHAT table
is dropped when running [fossil scrub --verily](/help?cmd=scrub).

On the server-side, message text is stored exactly as entered by the
users.  The /chat-poll page queries the CHAT table and constructs a
JSON reply described in the [/chat-poll
documentation](/help?cmd=/chat-poll).  The message text is translated
into HTML before being converted to JSON so that the text can be
safely added to the display using assignment to `innerHTML`. Though
`innerHTML` assignment is generally considered unsafe, it is only so
with untrusted content from untrusted sources. The chat content goes
through sanitization steps which eliminate any potential security
vulnerabilities of assigning that content to `innerHTML`.
