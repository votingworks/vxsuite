FROM python:3.7.3
RUN pip install --upgrade pip
RUN pip install pipenv
RUN apt-get update
RUN apt-get install -y \
    libpcsclite-dev \
    libusb-1.0-0-dev \
    pcsc-tools \
    pcscd \
    swig
RUN mkdir /code
WORKDIR /code
COPY Pipfile Pipfile.lock /code/
RUN pipenv install --dev