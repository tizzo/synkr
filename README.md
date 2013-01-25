# Synkr

Synkr is a node.js daemon powered by [watchr]() and [ssh2]() that recursively watches a set of directories and synchronizes any changes on that machine with another by reproducing the changes in a configurable directory on the remote machine over an SSH2 tunnel. An SSH connection is established with the remote machine and the socket is left open. Each time a change event occurs the corresponding operation is performed on the remote system

Synkr's goal is to help ensure eventual consistency

## Known issues

The watchr seems to miss some events if they happen very suddenly to recently created directories. This may have to do with the way inotify subscriptions are added for the newly created directories. This can be reproduced by watching a folder and then checkout out a large git repository into it.
