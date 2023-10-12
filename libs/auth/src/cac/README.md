# DoD Common Access Card Support

The DoD Common Access Card (CAC) is a smart card issued by the Department of
Defense (DoD) to civilian employees, military personnel, and contractors. The
CAC is used as a general identification card as well as for authentication to
enable access to DoD computer systems and networks.

At the moment, `vxsuite` does not use the CAC for authentication. However, the
`rave` repository which is based on `vxsuite` does. Because making changes in
the `auth` library to support CAC results in a lot of merge conflicts when
rebasing `rave`, the CAC support has pushed upstream to this repository.
