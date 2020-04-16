# Catalyst Peer Distributed Performance Tests

# Table of Contents
1. [Introduction](#introduction)
2. [Test components](#test-components)
    1. [Client](#client)
        2. [Headless browser scripts](#headless-browser-scripts)
        3. [Peer routines](#peer-routines)
        4. [Docker Image](#docker-image)
    2. [Test Results Server](#test-results-server)
    3. [Lighthouse](#lighthouse)
    4. [Graphana and InfluxDB](#graphana-influxdb)
3. [Running the tests](#running-the-tests)
    1. [Running them on Amazon](#running-them-on-amazon)
    2. [Running them locally](#running-them-locally)
        1. [Script to run all](#script-to-run-all)
        2. [Running the test server](#running-the-test-server)
        3. [Creating the test](#creating-the-test)
        4. [Running the clients](#running-the-clients)
            1. [Using docker or puppeteer](#using-docker-or-puppeteer)
            2. [Using the devserver and browser](#using-the-devserver-and-browser)
        5. [Finishing the test](#finishing-the-test)
    3. [Viewing the results](#viewing-the-results)
        1. [Graphana](#graphana)
        2. [Results JSON](#results-json)
4. [Pending improvements](#pending-improvements)

## Introduction

In order to be able to see the impact of the optimizations and configuration changes made in the peer library, there is a need to have comparable results between the different changes.

One way to have comparable results is to have an automated test. This part of the repository tries to be that automated test.

The main difficulty about automating this test is the resources required to run a significant amount of peers are quite a lot, and most computers cannot handle the load, effectively voiding the results. So in order to be able to produce meaningful results, the test needs to be distributed.

The Catalyst Peer Distributed Performance Tests is a suite components and scripts that allow running this test using docker containers in the cloud, and to collect and make sense of the results.

## Test components

### Client

The client is the part of the suite that actually runs the peer library and the test.

It consists of a simple browser application that connects to a provided Lighthouse, joins the `blue` layer and the `room` room and starts sending comms messages, according to a [routine](#peer-routines) that it runs. It also periodically collects statistics and sends them to a provided [results server](#test-results-server). The collected statistics are time based. Each statistic is considered a data point to be analyzed in a time based dashboard or query interface, like Graphana.

Its source code can be found in the [client](client) folder.

In order to run the client, there are two possibilities: [Running a local dev server](#using-the-dev-server-and-browser) and using any browser that supports WebRTC or running it through [docker](#using-docker-or-puppeteer).

#### Headless browser scripts

Since the client is a browser application, it needs a browser to run. This can make it harder to run it in a distributed environment. In order to be able to run the client in CLIs, and in order to be able to easily spin up multiple browsers for the test, the client component uses [Puppeteer](https://github.com/puppeteer/puppeteer).

There is a script that spins up the clients can be found in [run-clients.ts](run-clients.ts). By default it reads some parameters from the environments variables and spins 10 clients, passing those parameters to them. This script, along with the devserver, is the base for the [docker image](#docker-image)

#### Peer routines

The client uses an abstraction called `routine` to try to represent a particular behaviour of a simulated peer. The idea is to have different routines and to be able to configure each simulated peer with different routines in order to test the behaviour of the library when the peers perform different actions.

In the code, a routine is just a function that has the following type:

```typescript
type Routine = (elapsed: number, delta: number, peer: SimulatedPeer) => void;
```

It gets executed every "tick" of the client, wich should be around 60 times per second. The `elapsed` parameter is the time since the start of the simulation, and the `delta` parameter is the time that passed since the last tick. With that information, a routine can update 

At the time of writing this doc, only one routine was implemented and it just sends position messages every 100 ms, profile messages every 1000 ms, and chat messages every 10000 ms. See the [client/index.ts](client/index.ts) file to see how this routine was implemented.

#### Docker Image

In order to be able to run the clients easily on other computers without having to configure a development environment, a docker image was created. This image runs the devserver and then the [run-clients.ts](run-clients.ts) script.

The image is currently published in the `pablitar/peer-performance-test-client` repository on Dockerhub, but it should be moved in the future.

For more information about the image, see its [dockerfile](clientRunner.Dockerfile) and its [entrypoint](client_entrypoint.sh). Also see the section [Using docker or puppeteer](#using-docker-or-puppeteer) for more information about how to pass parameters to the clients.

### Test Results Server

Since the test is distributed, the results need to be collected by a centralized server. The Test Results Server is that component.

It is a simple express application with an API that the clients use to submit their statistics. It also allows the creation, starting, and finishing of testing. A test can be created and not started because the clients use that as a signal to start their routines.

Once the tests are finished, their results are stored in the file system. By default, 

### Lighthouse
### Graphana and InfluxDB
## Running the tests
### Running them on AWS
### Running them locally
#### Script to run all
#### Running the test server
#### Creating and starting a test
#### Running the clients
##### Using docker or puppeteer
##### Using the devserver and browser

The client is a Typescript app that is compiled to run in the browser. Currently it is configured with bazel.

There is a bazel build that you can run in order to have a devserver that serves the compiled application:

```bash
bazel 'run' '//comms/performance-test/client:devserver'
```

Once it is up, it will listen for requests in the port 7654.

#### Finishing the test (#finishing-the-test)
### Viewing the results
#### Graphana
#### Results JSON
## Pending improvements

