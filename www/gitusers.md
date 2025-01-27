# Git to Fossil Translation Guide

## Introduction

Fossil shares many similarities with Git.  In many cases, the
sub-commands are identical: [`fossil bisect`][fbis] does essentially the
same thing as [`git bisect`][gbis], for example.

This document covers the cases where there is no simple 1:1 mapping,
usually because of intentional design differences in Fossil that prevent
it from working exactly like Git. We choose to explain these differences
rather than provide a simple “translation dictionary,” since to
understand the conversion, you need to know why the difference exists.

We focus on practical command examples here, leaving discussions of the
philosophical underpinnings that drive these command differences to [another
document][fvg]. The [case studies](#cs1) do get a bit philosophical, but
it is with the aim of illustrating how these Fossil design differences
cause Fossil to behave materially differently from Git in everyday
operation.

We present this from the perspective of Git users moving to Fossil, but
it is also possible to read this document as a Fossil user who speaks
only pidgin Git, who may often have questions of the form, “Now how do I
do X in Git again?”

This document’s authors are intimately familiar with Fossil, so it is
difficult for us to anticipate the perspective of people who are
intimately familiar with Git. If you have a lot of prior Git
experience, we welcome your contributions and questions on the [Fossil
Forum][ffor].

While we do try to explain Fossil-specific terminology inline here
as-needed, you may find it helpful to skim [the Fossil glossary][gloss].
It will give you another take on our definitions here, and it may help
you to understand some of the other Fossil docs better.

[fbis]:  /help?cmd=bisect
[gbis]:  https://git-scm.com/docs/git-bisect
[ffor]:  https://fossil-scm.org/forum
[fvg]:   ./fossil-v-git.wiki


<a id="mwd"></a>
## Repositories And Checkouts Are Distinct

A repository and a check-out are distinct concepts in Fossil, whereas
the two are collocated by default with Git. This difference shows up in
several separate places when it comes to moving from Git to Fossil.



#### <a id="cwork" name="scw"></a> Checkout Workflows

A Fossil repository is a SQLite database storing the entire history of a
project. It is not normally stored inside the working tree.
A Fossil working tree — also called a check-out — is a directory
that contains a snapshot of your project that you are currently working
on, extracted for you from the repository database file by the `fossil`
program.

Git commingles these two by default, with the repository stored in a
`.git` subdirectory underneath your working directory. There are ways to
[emulate the Fossil working style in Git](#worktree), but because they’re not
designed into the core concept of the tool, Git tutorials usually
advocate a switch-in-place working mode instead, so that is how most
users end up working with Git. Contrast [Fossil’s check-out workflow
document][ckwf] to see the practical differences.

There is one Git-specific detail we wish to add beyond what that
document already covers. This command:

        git checkout some-branch

…is best given as:

        fossil update some-branch

…in Fossil. There is a [`fossil checkout`][co] command, but it has
[several differences](./co-vs-up.md) that make it less broadly useful
than [`fossil update`][up] in everyday operation, so we recommend that
Git users moving to Fossil develop a habit of typing `fossil up` rather
than `fossil checkout`. That said, one of those differences does match
up with Git users’ expectations: `fossil checkout` doesn’t pull changes
from the remote repository into the local clone as `fossil update` does.
We think this is less broadly useful, but that’s the subject of the next
section.

[ckwf]: ./ckout-workflows.md
[co]:   /help?cmd=checkout


#### <a id="pullup"></a> Update vs Pull

The closest equivalent to [`git pull`][gpull] is not
[`fossil pull`][fpull], but in fact [`fossil up`][up].

This is because
Fossil tends to follow the CVS command design: `cvs up` pulls
changes from the central CVS repository and merges them into the local
working directory, so that’s what `fossil up` does, too. (This design
choice also tends to make Fossil feel comfortable to Subversion
expatriates.)

The `fossil pull` command is simply the reverse of
`fossil push`, so that `fossil sync` [is functionally equivalent
to](./sync.wiki#sync):

        fossil push ; fossil pull

There is no implicit “and update the local working directory” step in Fossil’s
push, pull, or sync commands, as there is with `git pull`.

Someone coming from the Git perspective may perceive that `fossil up`
has two purposes:

*   Without the optional `VERSION` argument, it updates the working
    checkout to the tip of the current branch, like `git pull`.

*   Given a `VERSION` argument, it updates to the named version. If that’s the
    name of a branch, it updates to the tip of that branch rather than
    the current one, like `git checkout BRANCH`.

In fact, these are the same operation, so they’re the same command in
Fossil. The first form simply allows the `VERSION` to be implicit: the
current branch.

We think this is a more sensible command design than `git pull` vs
`git checkout`. ([…vs `git checkout` vs `git checkout`!][gcokoan])

[fpull]:   /help?cmd=pull
[gpull]:   https://git-scm.com/docs/git-pull
[gcokoan]: https://stevelosh.com/blog/2013/04/git-koans/#s2-one-thing-well


#### <a id="rname"></a> Naming Repositories

The Fossil repository database file can be named anything
you want, with a single exception: if you’re going to use the
[`fossil server DIRECTORY`][server] feature, the repositories you wish
to serve need to be stored together in a flat directory and have
"`.fossil`" suffixes. That aside, you can follow any other convention that
makes sense to you.

This author uses a scheme like the following on mobile machines that
shuttle between home and the office:

``` pikchr toggle indent
box "~/museum/" fit
move right 0.1
line right dotted
move right 0.05
box invis "where one stores valuable fossils" ljust

arrow down 50% from first box.s then right 50%
box "work/" fit
move right 0.1
line dotted
move right 0.05
box invis "projects from $dayjob" ljust

arrow down 50% from 2nd vertex of previous arrow then right 50%
box "home/" fit
move right 0.1
line dotted right until even with previous line.end
move right 0.05
box invis "personal at-home projects" ljust

arrow down 50% from 2nd vertex of previous arrow then right 50%
box "other/" fit
move right 0.1
line dotted right until even with previous line.end
move right 0.05
box invis "clones of Fossil itself, SQLite, etc." ljust
```

On a Windows box, you might instead choose "`C:\Fossils`"
and do without the subdirectory scheme, for example.


#### <a id="close" name="dotfile"></a> Closing A Check-Out

The [`fossil close`][close] command dissociates a check-out directory from the
Fossil repository database, nondestructively inverting [`fossil open`][open]. It
won’t remove the managed files, and unless you give the `--force`
option, it won’t let you close the check-out with uncommitted changes to
those managed files.

The `close` command refuses to run without `--force` when you have
certain precious per-checkout data, which Fossil stores in the
`.fslckout` file at the root of a check-out directory. This is a SQLite
database that keeps track of local state such as what version you have
checked out, the contents of the [stash] for that working directory, the
[undo] buffers, per-checkout [settings][set], and so forth. The stash
and undo buffers are considered precious uncommitted changes,
so you have to force Fossil to discard these as part of closing the
check-out.

Thus, `.fslckout` is not the same thing as `.git`!

In native Windows builds of Fossil — that is, excluding Cygwin and WSL
builds, which follow POSIX conventions —  this file is called `_FOSSIL_`
instead to get around the historical 3-character extension limit with
certain legacy filesystems.

Closing a check-out directory is a rare operation. One use case
is that you’re about to delete the directory, so you want Fossil to forget about it
for the purposes of commands like [`fossil all`][all]. Even that isn’t
necessary, because Fossil will detect that this has happened and forget
the working directory for you.

[all]: /help?cmd=all


#### <a id="worktree"></a> Git Worktrees

There are at least three different ways to get [Fossil-style multiple
check-out directories][mcw] with Git.

The old way is to simply symlink the `.git` directory between working
trees:

        mkdir ../foo-branch
        ln -s ../actual-clone-dir/.git .
        git checkout foo-branch

The symlink trick has a number of problems, the largest being that
symlinks weren’t available on Windows until Vista, and until the Windows
10 Creators Update was released in spring of 2017, you had to be an
Administrator to use the feature besides. ([Source][wsyml]) Git solved
this problem two years earlier with the `git-worktree` command in Git
2.5:

        git worktree add ../foo-branch foo-branch
        cd ../foo-branch

That is approximately equivalent to this in Fossil:

        mkdir ../foo-branch
        fossil open /path/to/repo.fossil foo-branch

That then leads us to the closest equivalent in Git to [closing a Fossil
check-out](#close):

        git worktree remove .

Note, however, that unlike `fossil close`, once the Git command
determines that there are no uncommitted changes, it blows away all of
the checked-out files! Fossil’s alternative is shorter, easier to
remember, and safer.

There’s another way to get Fossil-like separate worktrees in Git:

        git clone --separate-git-dir repo.git https://example.com/repo

This allows you to have your Git repository directory entirely separate
from your working tree, with `.git` in the check-out directory being a
file that points to `../repo.git`, in this example.

As of Fossil 2.14, there is a direct equivalent:

        fossil clone https://example.com/repo

It’s a shorter command because we deduce `repo.fossil` and the `repo/`
working directory from the last element of the path in the URI. If you
wanted to override both deductions, you’d say:

        fossil clone --workdir foo https://example.com/repo/bar

That gets you `bar.fossil` with a `foo/` working directory alongside it.

[mcw]:   ./ckout-workflows.md#mcw
[wsyml]: https://blogs.windows.com/windowsdeveloper/2016/12/02/symlinks-windows-10/


#### <a id="iip"></a> Init In Place

To illustrate the differences that Fossil’s separation of repository
from working directory creates in practice, consider this common Git “init in place”
method for creating a new repository from an existing tree of files,
perhaps because you are placing that project under version control for
the first time:

        cd long-established-project
        git init
        git add *
        git commit -m "Initial commit of project."

The closest equivalent in Fossil is:

        cd long-established-project
        fossil init .fsl
        fossil open --force .fsl
        fossil add *
        fossil ci -m "Initial commit of project."

Note that unlike in Git, you can abbreviate the “`commit`” command in
Fossil as “`ci`” for compatibility with CVS, Subversion, etc.

This creates a `.fsl` repo DB at the root of the project check-out to
emulate the `.git` repo dir. We have to use the `--force` flag on
opening the new repo because Fossil expects you to open a repo into an
empty directory in order to avoid spamming the contents of a repo over
an existing directory full of files. Here, we know the directory
contains files that will soon belong in the repository, though, so we
override this check. From then on, Fossil works like Git, for the
purposes of this example.

We’ve drawn this example to create a tight parallel between Fossil and
Git, not to commend this `.fsl`-at-project-root trick to you. A better
choice would be `~/museum/home/long-established-project.fossil`, if
you’re following [the directory scheme exemplified above](#rname). That said, it
does emphasize an earlier point: Fossil doesn’t care where you put the
repo DB file or what you name it.


[clone]:  /help?cmd=clone
[close]:  /help?cmd=close
[gloss]:  ./whyusefossil.wiki#definitions
[open]:   /help?cmd=open
[set]:    /help?cmd=setting
[server]: /help?cmd=server
[stash]:  /help?cmd=stash
[undo]:   /help?cmd=undo


## <a id="log"></a> Fossil’s Timeline Is The “Log”

Git users often need to use the `git log` command to dig linearly through
commit histories due to its [weak data model][wdm], giving [O(n)
performance][ocomp].

Fossil parses a huge amount of information out of commits that allow it
to produce its [timeline CLI][tlc] and [its `/timeline` web view][tlw]
using indexed SQL lookups, which generally have the info you would have
to manually extract from `git log`, produced much more quickly than Git
can, all else being equal: operations over [SQLite’s B-tree data structures][btree]
generally run in O(log n) time, faster than O(n) for equal *n* when the
constants are equal. Yet the constants are *not* equal because Fossil
reads from a single disk file rather than visit potentially many
files in sequence as Git must, so the OS’s buffer cache can result in
[still better performance][35pct].

Unlike Git’s log, Fossil’s timeline shows info across branches by
default, a feature for maintaining better situational awareness. The
`fossil timeline` command has no way to show a single branch’s commits,
but you can restrict your view like this using the web UI equivalent by
clicking the name of a branch on the `/timeline` or `/brlist` page. (Or
manually, by adding the `r=` query parameter.) Note that even in this
case, the Fossil timeline still shows other branches where they interact
with the one you’ve referenced in this way; again, better situational
awareness.


#### <a id="emu-log"></a> Emulating `git log`

If you truly need a backwards-in-time-only view of history in Fossil to
emulate `git log`, this is as close as you can currently come:

        fossil timeline parents current

Again, though, this isn’t restricted to a single branch, as `git log`
is.

Another useful rough equivalent is:

        git log --raw
        fossil time -v

This shows what changed in each version, though Fossil’s view is more a
summary than a list of raw changes. To dig deeper into single commits,
you can use Fossil’s [`info` command][infoc] or its [`/info` view][infow].

Inversely, you may more exactly emulate the default `fossil timeline`
output with `git log --name-status`.


#### <a id="whatchanged"></a> What Changed?

A related — though deprecated — command is `git whatchanged`, which gives results similar to
`git log --raw`, so we cover it here.

Though there is no `fossil whatchanged` command, the same sort of
information is available. For example, to pull the current changes from
the remote repository and then inspect them before updating the local
working directory, you might say this in Git:

        git fetch
        git whatchanged ..@{u}

…which you can approximate in Fossil as:

        fossil pull
        fossil up -n
        fossil diff --from tip

To invert the `diff` to show a more natural patch, the command needs to
be a bit more complicated, since you can’t currently give `--to`
without `--from`.

        fossil diff --from current --to tip

Rather than use the “dry run” form of [the `update` command][up], you can
say:

        fossil timeline after current

…or if you want to restrict the output to the current branch:

        fossil timeline descendants current


#### <a id="ckin-names"></a> Symbolic Check-In Names

Note the use of [human-readable symbolic version names][scin] in Fossil
rather than [Git’s cryptic notations][gcn].

For a more dramatic example of this, let us ask Git, “What changed since the
beginning of last month?” being October 2020 as I write this:

        git log master@{2020-10-01}..HEAD

That’s rather obscure! Fossil answers the same question with a simpler
command:

        fossil timeline after 2020-10-01

You may need to add `-n 0` to bypass the default output limit of
`fossil timeline`, 20 entries. Without that, this command reads
almost like English.

Some Git users like to write commands like the above so:

        git log @{2020-10-01}..@

Is that better? “@” now means two different things: an at-time reference
and a shortcut for `HEAD`!

If you are one of those that like short commands, Fossil’s method is
less cryptic: it lets you shorten words in most cases up to the point
that they become ambiguous. For example, you may abbreviate the last
`fossil` command in the prior section:

        fossil tim d c

…beyond which the `timeline` command becomes ambiguous with `ticket`.

Some Fossil users employ shell aliases, symlinks, or scripts to shorten
the command still further:

        alias f=fossil
        f tim d c

Granted, that’s rather obscure, but you you can also choose something
intermediate like “`f time desc curr`”, which is reasonably clear.

[35pct]: https://www.sqlite.org/fasterthanfs.html
[btree]: https://sqlite.org/btreemodule.html
[gcn]:   https://git-scm.com/docs/gitrevisions
[infoc]: /help?cmd=info
[infow]: /help?cmd=/info
[ocomp]: https://www.bigocheatsheet.com/
[tlc]:   /help?cmd=timeline
[tlw]:   /help?cmd=/timeline
[up]:    /help?cmd=update
[wdm]:   ./fossil-v-git.wiki#durable


## <a id="dhead"></a> Detached HEAD State

The SQL indexes in Fossil which we brought up above have a very useful
side benefit: you cannot have a [detached HEAD state][gdh] in Fossil,
the source of untold pain and data loss in Git. It simply cannot be done
in Fossil, because the indexes always let us find our way back into the
hash tree.


## <a id="slcom"></a> Summary Line Convention In Commit Comments

The Git convention of a [length-limited summary line][lsl] at the start
of commit comments has no equivalent in Fossil. You’re welcome to style
your commit comments thus, but the convention isn’t used or enforced
anywhere in Fossil. For instance, setting `EDITOR=vim` and making a
commit doesn’t do syntax highlighting on the commit message to warn that
you’ve gone over the conventional limit on the first line, and the
Fossil web timeline display doesn’t show the summary line in bold.

If you wish to follow such conventions in a Fossil project, you may want
to enable the “Allow block-markup in timeline” setting under Admin →
Timeline in the web UI to prevent Fossil from showing the message as a
single paragraph, sans line breaks. [Skin customization][cskin] would
allow you to style the first line of the commit message in bold in
`/timeline` views.

[cskin]: ./customskin.md
[lsl]:   https://chris.beams.io/posts/git-commit/#limit-50



<a id="staging"></a>
## There Is No Staging Area

Fossil omits the "Git index" or "staging area" concept.  When you
type "`fossil commit`" _all_ changes in your check-out are committed,
automatically.  There is no need for the "-a" option as with Git.

If you only want to commit _some_ of the changes, list the names
of the files or directories you want to commit as arguments, like this:

        fossil commit src/feature.c doc/feature.md examples/feature

Although there are currently no
<a id="csplit"></a>[commit splitting][gcspl] features in Fossil like
`git add -p`, `git commit -p`, or `git rebase -i`, you can get the same
effect by converting an uncommitted change set to a patch and then
running it through [Patchouli].

Rather than use `fossil diff -i` to produce such a patch, a safer and
more idiomatic method would be:

        fossil stash save -m 'my big ball-o-hackage'
        fossil stash diff > my-changes.patch

That stores your changes in the stash, then lets you operate on a copy
of that patch. Each time you re-run the second command, it will take the
current state of the working directory into account to produce a
potentially different patch, likely smaller because it leaves out patch
hunks already applied.

In this way, the combination of working tree and stash replaces the need
for Git’s index feature.

This also solves a philosophical problem with `git commit -p`: how can
you test that a split commit doesn’t break anything if you do it as part
of the commit action? Git’s lack of an autosync feature means you can
commit locally and then rewrite history if the commit doesn’t work out,
but we’d rather make changes only to the working directory, test the
changes there, and only commit once we’re sure it’s right.

This also explains why we don’t have anything like `git rebase -i`
to split an existing commit: in Fossil, commits are *commitments,* not
something you want to go back and rewrite later.

If someone does [contribute][ctrb] a commit splitting feature to Fossil,
we’d expect it to be an interactive form of
[`fossil stash apply`][stash], rather than follow Git’s ill-considered
design leads.

[ctrb]:      https://fossil-scm.org/fossil/doc/trunk/www/contribute.wiki
[gcspl]:     https://git-scm.com/docs/git-rebase#_splitting_commits
[Patchouli]: https://pypi.org/project/patchouli/


<a id="bneed"></a>
## Create Branches At Point Of Need, Rather Than Ahead of Need

Fossil prefers that you create new branches as part of the first commit
on that branch:

        fossil commit --branch my-new-branch

If that commit is successful, your local check-out directory is then
switched to the tip of that branch, so subsequent commits don’t need the
“`--branch`” option. You simply say `fossil commit` again to continue
adding commits to the tip of that branch.

To switch back to the parent branch, say something like:

        fossil update trunk       # ≅ git checkout master

Fossil does also support the Git style, creating the branch ahead of
need:

        fossil branch new my-new-branch
        fossil update my-new-branch
        ...work on first commit...
        fossil commit

This is more verbose, but it has the same effect: put the first commit
onto `my-new-branch` and switch the check-out directory to that branch so
subsequent commits are descendants of that initial branch commit.

Fossil also allows you to move a check-in to a different branch
*after* you commit it, using the "`fossil amend`" command.
For example:

        fossil amend current --branch my-new-branch

(The version string “current” is one of the [special check-in names][scin] in Fossil. See
that document for the many other names you can give to “`amend`”, or
indeed to any other Fossil command documented to accept a `VERSION` or
`NAME` string.)

[scin]: ./checkin_names.wiki


<a id="autosync"></a>
## Autosync

Fossil’s [autosync][wflow] feature, normally enabled, has no
equivalent in Git. If you want Fossil to behave like Git, you can turn
it off:

        fossil set autosync 0

However, it’s better to understand what the feature does and why it is enabled by
default.

When autosync is enabled, Fossil automatically pushes your changes
to the remote server whenever you "`fossil commit`", and it
pulls all remote changes down to your local clone of the repository as
part of a "`fossil update`".
This provides most of the advantages of a centralized version control
system while retaining the advantages of distributed version control:

1.  Your work stays synced up with your coworkers’ efforts as long as your
    machine can connect to the remote repository. At need, you can go
    off-network and continue work atop the last version you sync’d with
    the remote.

2.  It provides immediate off-machine backup of your commits. Unlike
    centralized version control, though, you can still work while
    disconnected; your changes will sync up with the remote once you get
    back online.

3.  Because there is little distinction between the clones in the Fossil
    model — unlike in Git, where clones often quickly diverge from each
    other, quite possibly on purpose — the backup advantage applies in inverse
    as well: if the remote server falls over dead, one of those with a
    clone of that repository can stand it back up, and everyone can get
    back to work simply by re-pointing their local repo at the new
    remote.  If the failed remote comes back later, it can sync with the
    new central version, then perhaps take over as the primary source of
    truth once again.

    (There are caveats to this, [covered elsewhere][bu].)

[bu]:    ./backup.md
[setup]: ./caps/admin-v-setup.md#apsu
[wflow]: ./concepts.wiki#workflow


<a id="syncall"></a>
## Sync Is All-Or-Nothing

Fossil does not support the concept of syncing, pushing, or pulling
individual branches.  When you sync/push/pull in Fossil, it
processes all artifacts in its hash tree:
branches, tags, wiki articles, tickets, forum posts, technotes…
This is [not quite “everything,” full stop][bu], but it’s close.

Furthermore, branch *names* sync automatically in Fossil, not just the
content of those branches. That means this common Git command:

        git push origin master

…is simply this in Fossil:

        fossil push

Fossil doesn’t need to be told what to push or where to push it: it just
keeps using the same remote server URL you gave it last
until you [tell it to do something different][rem], and it pushes all
branches, not just one named local branch.

[rem]: /help?cmd=remote


<a id="trunk"></a>
## The Main Branch Is Called "`trunk`"

In Fossil, the default name for the main branch
is "`trunk`".  The "`trunk`" branch in Fossil corresponds to the
"`master`" branch in stock Git or to [the “`main`” branch in GitHub][mbgh].

Because the `fossil git export` command has to work with both stock Git
and with GitHub, Fossil uses Git’s traditional default rather than
GitHub’s new default: your Fossil repo’s “trunk” branch becomes “master”
when [mirroring to GitHub][mirgh] unless you give the `--mainbranch`
option added in Fossil 2.14.

We do not know what happens on subsequent exports if you later rename
this branch on the GitHub side.

[mbgh]:  https://github.com/github/renaming
[mirgh]: ./mirrortogithub.md


<a id="unmanaged"></a>
## The "`fossil status`" Command Does Not Show Unmanaged Files

The "`fossil status`" command shows you what files in your check-out have
been edited and scheduled for adding or removing at the next commit.
But unlike "`git status`", the "`fossil status`" command does not warn
you about unmanaged files in your local check-out.  There is a separate
"`fossil extras`" command for that.


<a id="rebase"></a>
## There Is No Rebase

Fossil does not support rebase, [on purpose][3].

This is a deliberate design decision that the Fossil community has
thought about carefully and discussed many times, resulting in the
linked document. If you are fond of rebase, you should read it carefully
before expressing your views: it not only answers many of the common
arguments in favor of rebase known at the time the document’s first
draft was written, it’s been revised multiple times to address less
common objections as well. Chances are not good that you are going to
come up with a new objection that we haven’t already considered and
addressed there.

There is only one sub-feature of `git rebase` that is philosophically
compatible with Fossil yet which currently has no functional equivalent.
We cover [this and the workaround for it](#csplit) above.

[3]: ./rebaseharm.md


## <a name="cdiff"></a> Colorized Diffs

The graphical diffs in the Fossil web UI and `fossil diff --tk` use
color to distinguish insertions, deletions, and replacements, but unlike
with `git diff` when the output is to an ANSI X3.64 capable terminal,
`fossil diff` does not.

There are a few easy ways to add this feature to Fossil, though.

One is to install
[`colordiff`][cdiff], which is included in [many package systems][cdpkg],
then say:

        fossil set --global diff-command 'colordiff -wu'

Because this is unconditional, unlike `git diff --color=auto`, you will
then have to remember to add the `-i` option to `fossil diff` commands
when you want color disabled, such as when piping diff output to another
command that doesn’t understand ANSI escape sequences. There’s an
example of this [below](#dstat).

Another way, which avoids this problem, is to say instead:

        fossil set --global diff-command 'git diff --no-index'

This delegates `fossil diff` to `git diff` by using the latter’s
ability to run on files not inside any repository.

[cdpkg]: https://repology.org/project/colordiff/versions


## <a id="show"></a> Showing Information About Commits

While there is no direct equivalent to Git’s “`show`” command, similar
functionality may be present in Fossil under other commands:


#### <a name="patch"></a> Show A Patch For A Commit

        git show -p COMMIT_ID

…gives much the same output as

        fossil diff --checkin COMMIT_ID

…only without the patch email header. Git comes out of the [LKML] world,
where emailing a patch is a normal thing to do. Fossil is [designed for
cohesive teams][devorg] where such drive-by patches are rarer.

You can use any of [Fossil’s special check-in names][scin] in place of
the `COMMIT_ID` in this and later examples. Fossil docs usually say
“`VERSION`” or “`NAME`” where this is allowed, since the version string
or name might not refer to a commit ID, but instead to a forum post, a
wiki document, etc. The following command answers the question “What did
I just commit?”

        fossil diff --checkin tip

[devorg]: ./fossil-v-git.wiki#devorg
[LKML]:   https://lkml.org/


#### <a name="cmsg"></a> Show A Specific Commit Message

        git show -s COMMIT_ID


…is

        fossil time -n 1 COMMIT_ID

…or with a shorter, more obvious command, though with more verbose output:

        fossil info COMMIT_ID

The `fossil info` command isn’t otherwise a good equivalent to
`git show`; it just overlaps its functionality in some areas. Much of
what’s missing is present in the corresponding [`/info` web
view][infow], though.


#### <a name="dstat"></a> Diff Statistics

Fossil’s closest internal equivalent to commands like
`git show --stat` is:

        fossil diff -i --from 2020-04-01 --numstat

The `--numstat` output is a bit cryptic, so we recommend delegating
this task to [the widely-available `diffstat` tool][dst], which gives
a histogram in its default output mode rather than bare integers:

        fossil diff -i -v --from 2020-04-01 | diffstat

We gave the `-i` flag in both cases to force Fossil to use its internal
diff implementation, bypassing [your local `diff-command` setting][dcset].
The `--numstat` option has no effect when you have an external diff
command set, and some diff command alternatives like
[`colordiff`][cdiff] (covered [above](#cdiff)) produce output that confuses `diffstat`.

If you leave off the `-v` flag in the second example, the `diffstat`
output won’t include info about any newly-added files.

[cdiff]: https://www.colordiff.org/
[dcset]: https://fossil-scm.org/home/help?cmd=diff-command
[dst]:   https://invisible-island.net/diffstat/diffstat.html


<a id="btnames"></a>
## Branch And Tag Names

Fossil has no special restrictions on the names of tags and branches,
though you might want to keep [Git's tag and branch name restrictions][gcrf]
in mind if you plan on [mirroring your Fossil repository to GitHub][mirgh].

Fossil does not require tag and branch names to be unique.  It is
common, for example, to put a "`release`" tag on every release for a
Fossil-hosted project. This does not create a conflict in Fossil, since
Fossil resolves the ambiguity in a predictable way: the newest match
wins. Therefore, “`fossil up release`” always gets you the current
release in a project that uses this tagging convention.

[The `fossil git export` command][fge] squashes repeated tags down to a
single instance to avoid confusing Git, exporting only the newest tag,
emulating Fossil’s own ambiguity resolution rule as best it can within
Git’s limitations.

[fge]:  /help?cmd=git
[gcrf]: https://git-scm.com/docs/git-check-ref-format




<a id="cpickrev"></a>
## Cherry-Picking And Reverting Commits

Git’s separate "`git cherry-pick`" and “`git revert`” commands are
options to the [`fossil merge` command][merge]: `--cherrypick` and
`--backout`, respectively.

Unlike in Git, the Fossil file format remembers cherrypicks and backouts
and can later show them as dashed lines on the graphical timeline.

[merge]: /help?cmd=merge



<a id="mvrm"></a>
## File Moves And Renames Are Soft By Default

The "[`fossil mv`][mv]" and "[`fossil rm`][rm]" commands work like they
do in CVS in that they schedule the changes for the next commit by
default: they do not actually rename or delete the files in your
check-out.

If you don’t like that default, you can change it globally:

        fossil setting --global mv-rm-files 1

Now these commands behave like in Git in any Fossil repository where
this setting hasn’t been overridden locally.

If you want to keep Fossil’s soft `mv/rm` behavior most of the time, you
can cast it away on a per-command basis:

        fossil mv --hard old-name new-name

[mv]: /help?cmd=mv
[rm]: /help?cmd=rm


----


## <a id="cvdate" name="cs1"></a> Case Study 1: Checking Out A Version By Date

Let’s get into something a bit more complicated: a case study showing
how the concepts lined out above cause Fossil to materially differ in
day-to-day operation from Git.

Why would you want to check out a version of a project by date?  Perhaps
because your customer gave you a vague bug report referencing only a
date rather than a version. Or, you may be poking semi-randomly through
history to find a “good” version to anchor the start point of a
[`fossil bisect`][fbis] operation.

My search engine’s first result for “git checkout by date” is [this
highly-upvoted accepted Stack Overflow answer][gcod]. The first command
it gives is based on Git’s [`rev-parse` feature][grp]:

        git checkout master@{2020-03-17}

There are a number of weaknesses in this command. From least to most
critical:

1.  It’s a bit cryptic. Leave off the refname or punctuation, and it
    means something else. You cannot simplify the cryptic incantation in
    the typical use case.

2.  A date string in Git without a time will be interpreted as
    “[at the local wall clock time on the given date][gapxd],” so the
    command means something different from one second to the next. This
    can be a problem if there are multiple commits on that date, because
    the command will give different results depending on the time of
    day you run it.

3.  It gives misleading output if there is no close match for the date
    in the local [reflog]. It starts out empty after a fresh clone, and
    while it does build up as you use that clone, Git [automatically
    prunes][gle] the reflog to 90 days of history by default. This means
    the command above can give different results from one machine to the
    next, or even from one day to the next on the same clone.

    The command won’t fail outright if the reflog can’t resolve the
    given date: it simply gives the closest commit it can come up with,
    even if it’s months or years out from your target! Sometimes it
    gives a warning about the reflog not going back far enough to give a
    useful result, and sometimes it doesn’t. If you’re on a fresh clone,
    you are likely to get the “tip” commit’s revision ID no matter what
    date value you give.

    Git tries its best, but because it’s working from a purgeable and
    possibly-stale local cache, you cannot trust its results.

We cannot recommend this command at all. It’s unreliable even in the
best case.

That same Stack Overflow answer therefore goes on to recommend an
entirely different command:

        git checkout $(git rev-list -n 1 --first-parent --before="2020-03-17" master)

We believe you get such answers to Git help requests in part
because of its lack of an always-up-to-date [index into its log](#log) and in
part because of its “small tools loosely joined” design philosophy. This
sort of command is therefore composed piece by piece:

<center>◆  ◆  ◆</center>

“Oh, I know, I’ll search the rev-list, which outputs commit IDs by
parsing the log backwards from `HEAD`! Easy!”

        git rev-list --before=2020-03-17

“Blast! Forgot the commit ID!”

        git rev-list --before=2020-03-17 master

“Double blast! It just spammed my terminal with revision IDs! I need to
limit it to the single closest match:

        git rev-list -n 1 --before=2020-03-17 master

“Okay, it gives me a single revision ID now, but is it what I’m after?
Let’s take a look…”

        git show $(git rev-list -n 1 --before=2020-03-17 master)

“Oops, that’s giving me a merge commit, not what I want.
Off to search the web… Okay, it says I need to give either the
`--first-parent` or `--no-merges` flag to show only regular commits,
not merge-commits. Let’s try the first one:”

        git show $(git rev-list -n 1 --first-parent --before=2020-03-17 master)

“Better. Let’s check it out:”

        git checkout $(git rev-list -n 1 --first-parent --before=2020-03-17 master)

“Success, I guess?”

<center>◆  ◆  ◆</center>

This vignette is meant to explain some of Git’s popularity: it rewards
the sort of people who enjoy puzzles, many of whom are software
developers and thus need a tool like Git. Too bad if you’re just a
normal user.

And too bad if you’re a Windows user who doesn’t want to use [Git
Bash][gbash], since neither of the stock OS command shells have a
command interpolation feature needed to run that horrid command.

This alternative command still has weakness #2 above: if you run the
second `git show` command above on [Git’s own repository][gitgh], your
results may vary because there were four non-merge commits to Git on the
17th of March, 2020.

You may be asking with an exasperated huff, “What is your *point*, man?”
The point is that the equivalent in Fossil is simply:

        fossil up 2020-03-17

…which will *always* give the commit closest to midnight UTC on the 17th
of March, 2020, no matter whether you do it on a fresh clone or a stale
one.  The answer won’t shift about from one clone to the next or from
one local time of day to the next. We owe this reliability and stability
to three Fossil design choices:

*  Parse timestamps from all commits on clone into a local commit index,
   then maintain that index through subsequent commits and syncs.

*  Use an indexed SQL `ORDER BY` query to match timestamps to commit
   IDs for a fast and consistent result.

*  Round timestamp strings up using [rules][frud] consistent across
   computers and local time of day.

[frud]:   https://fossil-scm.org/home/file/src/name.c?ci=d2a59b03727bc3&ln=122-141
[gbash]:  https://appuals.com/what-is-git-bash/
[gapxd]:  https://github.com/git/git/blob/7f7ebe054a/date.c#L1298-L1300
[gcod]:   https://stackoverflow.com/a/6990682/142454
[gdh]:    https://www.git-tower.com/learn/git/faq/detached-head-when-checkout-commit/
[gitgh]:  https://github.com/git/git/
[gle]:    https://git-scm.com/docs/git-reflog#_options_for_expire
[gmc]:    https://github.com/git/git/commit/67b0a24910fbb23c8f5e7a2c61c339818bc68296
[grp]:    https://git-scm.com/docs/git-rev-parse
[reflog]: https://git-scm.com/docs/git-reflog

----

## <a id="morigin" name="cs2"></a> Case Study 2: Multiple "origin" Servers

Now let us consider a common use case at the time of this writing — during the
COVID-19 pandemic — where you’re working from home a lot, going into the
office one part-day a week only to do things that have to be done
on-site at the office.  Let us also say you have no remote
access back into the work LAN, such as because your site IT is paranoid
about security. You may still want off-machine backups of your commits
while working from home,
so you need the ability to quickly switch between the “home” and
“work” remote repositories, with your laptop acting as a kind of
[sneakernet][sn] link between the big development server at the office
and your family’s home NAS.

#### Git Method

We first need to clone the work repo down to our laptop, so we can work on it
at home:

        git clone https://dev-server.example.com/repo
        cd repo
        git remote rename origin work

The last command is optional, strictly speaking. We could continue to
use Git’s default name for the work repo’s origin — sensibly enough
called “`origin`” — but it makes later commands harder to understand, so
we rename it here. This will also make the parallel with Fossil easier
to draw.

The first time we go home after this, we have to reverse-clone the work
repo up to the NAS:

        ssh my-nas.local 'git init --bare /SHARES/dayjob/repo.git'
        git push --all ssh://my-nas.local//SHARES/dayjob/repo.git

Realize that this is carefully optimized down to these two long
commands. In practice, we’d expect a user typing these commands by hand from memory
to need to give four or more commands here instead.
Packing the “`git init`” call into the “`ssh`” call is something more
often done in scripts and documentation examples than done interactively,
which then necessitates a third command before the push, “`exit`”.
There’s also a good chance that you’ll forget the need for the `--bare`
option here to avoid a fatal complaint from Git that the laptop can’t
push into a non-empty repo. If you fall into this trap, among the many
that Git lays for newbies, you have to nuke the incorrectly initted
repo, search the web or Git man pages to find out about `--bare`, and try again.

Having navigated that little minefield,
we can tell Git that there is a second origin, a “home” repo in
addition to the named “work” repo we set up earlier:

        git remote add home ssh://my-nas.local//SHARES/dayjob/repo.git
        git config master.remote home

We don’t have to push or pull because the remote repo is a complete
clone of the repo on the laptop at this point, so we can just get to
work now, committing along the way to get our work safely off-machine
and onto our home NAS, like so:

        git add
        git commit
        git push

We didn’t need to give a remote name on the push because we told it the
new upstream is the home NAS earlier.

Now Friday comes along, and one of your office-mates needs a feature
you’re working on. You agree to come into the office later that
afternoon to sync up via the dev server:

        git push work master      # send your changes from home up
        git pull work master      # get your coworkers’ changes

Alternately, we could add “`--set-upstream/-u work`” to the first
command if we were coming into work long enough to do several Git-based things, not just pop in and sync.
That would allow the second to be just “`git pull`”, but the cost is
that when returning home, you’d have to manually reset the upstream
again.

This example also shows a consequence of that fact that
[Git doesn’t sync branch names](#syncall): you have to keep repeating
yourself like an obsequious supplicant: “Master, master.” Didn’t we
invent computers to serve humans, rather than the other way around?


#### Fossil Method

Now we’re going to do the same thing using Fossil, with
the commands arranged in blocks corresponding to those above for comparison.

We start the same way, cloning the work repo down to the laptop:

        fossil clone https://dev-server.example.com/repo
        cd repo
        fossil remote add work https://dev-server.example.com/repo

We’ve chosen the new “`fossil clone URI`” syntax added in Fossil 2.14 rather than separate
`clone` and `open` commands to make the parallel with Git clearer. [See
above](#mwd) for more on that topic.

Our [`remote` command][rem] is longer than the Git equivalent because
Fossil currently has no short command
to rename an existing remote. Worse, unlike with Git, we can’t just keep
using the default remote name because Fossil uses that slot in its
configuration database to store the *current* remote name, so on
switching from work to home, the home URL will overwrite the work URL if
we don’t give it an explicit name first.

Although the Fossil commands are longer, so far, keep it in perspective:
they’re one-time setup costs,
easily amortized to insignificance by the shorter day-to-day commands
below.

On first beginning to work from home, we reverse-clone the Fossil repo
up to the NAS:

        rsync repo.fossil my-nas.local:/SHARES/dayjob/

Now we’re beginning to see the advantage of Fossil’s simpler model,
relative to the tricky “`git init && git push`” sequence above.
Fossil’s alternative is almost impossible to get
wrong: copy this to that.  *Done.*

We’re relying on the `rsync` feature that creates up to one level of
missing directory (here, `dayjob/`) on the remote. If you know in
advance that the remote directory already exists, you could use a
slightly shorter `scp` command instead. Even with the extra 2 characters
in the `rsync` form, it’s much shorter because a Fossil repository is a
single SQLite database file, not a tree containing a pile of assorted
files.  Because of this, it works reliably without any of [the caveats
inherent in using `rsync` to clone a Git repo][grsync].

Now we set up the second remote, which is again simpler in the Fossil
case:

        fossil remote add home ssh://my-nas.local//SHARES/dayjob/repo.fossil
        fossil remote home

The first command is nearly identical to the Git version, but the second
is considerably simpler. And to be fair, you won’t find the
“`git config`” command above in all Git tutorials. The more common
alternative we found with web searches is even longer:
“`git push --set-upstream home master`”.

Where Fossil really wins is in the next step, making the initial commit
from home:

        fossil ci

It’s one short command for Fossil instead of three for Git — or two if
you abbreviate it as “`git commit -a && git push`” — because of Fossil’s
[autosync feature](#autosync) feature and deliberate omission of a
[staging feature](#staging).

The “Friday afternoon sync-up” case is simpler, too:

        fossil remote work
        fossil sync

Back at home, it’s simpler still: we can do away with the second command,
saying just “`fossil remote home`” because the sync will happen as part
of the next commit, thanks once again to Fossil’s autosync feature.

[grsync]: https://stackoverflow.com/q/1398018/142454
[qs]:     ./quickstart.wiki
[shwmd]:  ./fossil-v-git.wiki#checkouts
[sn]:     https://en.wikipedia.org/wiki/Sneakernet
