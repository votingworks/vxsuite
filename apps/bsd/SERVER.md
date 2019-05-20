# VotingWorks BAS Server

When running on an actual activation station in localhost mode, you should use
this simple server.

The instructions here are for Ubuntu Linux 18.04

## Install Requisite Software

```
sudo add-apt-repository ppa:deadsnakes/ppa
sudo apt install python3.7
pip3 install pipenv
cd server/
pipenv install
```

## Start the Development Server

Make sure you're in the `server/` directory

```
pipenv shell
make run
```
