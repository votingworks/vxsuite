# SEMS Converter Module 

This web server component provides a web interface to convert files for Mississippi's SEMS.

## Install Requisite Software

```
sudo add-apt-repository ppa:deadsnakes/ppa
sudo make install-python
make install-dependencies
```

## Run Tests

Install dependencies you need

```
make install-dev-dependencies
```

and then run the tests

```
make test
```

With code coverage

```
make coverage
```

## Start the Development Server

```
pipenv shell
make run
```

## API

First, some API calls that inform the front-end about the files that are needed for conversion:
* `GET /convert/election/filelist` lists the files that are needed for conversion into an election file
* `GET /convert/results/filelist` lists the files that are produced for results

Then, submission of files
* `POST /convert/election/submitfile`
* `POST /convert/result/submitfile`

Request the processing
* `POST /convert/election/process` converts SEMS election files to a Vx Election File
* `POST /convert/results/process` converts Vx CVRs to a SEMS result file

Read the results
* `GET /convert/election/output` download the election.json file
* `GET /convert/election/result?name=` download the result file indicated by the name picked from the `results/filelist`
