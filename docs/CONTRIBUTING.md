# Contributing to Decentraland's catalyst

We love your input! We want to make contributing to this project as easy and transparent as possible, whether it's:

- Reporting a bug
- Discussing the current state of the code
- Submitting a fix
- Proposing new features

## We Develop with Github

We use GitHub to host code, to track issues and feature requests, as well as accept pull requests.

## We Use [Github Flow](https://docs.github.com/en/get-started/quickstart/github-flow), So All Code Changes Happen Through Pull Requests

Pull requests are the best way to propose changes to the codebase (we use [Github Flow](https://docs.github.com/en/get-started/quickstart/github-flow)). We actively welcome your pull requests:

1. Fork the repo and create your branch from `main`.
1. If you've added code that should be tested, add tests.
1. Contribution should not break the current protocol implementation, this means not breaking any existing API, as this could have an impact on many people work and API consumers. If your contribution needs to add a breaking change, please file a [DAO poll](https://governance.decentraland.org/) so that the community can understand and accept your suggestion. Once accepted update the protocol by sending a pull request at the [api spec repository](https://github.com/decentraland/catalyst-api-specs). Then send the pull request with the implementation in this repository.
1. Run `yarn run test` to ensure the test suite passes.
1. Make sure your code lints.
1. Issue that pull request!

## Creating a pull request

We follow the [Git style guide](https://github.com/decentraland/adr/blob/main/docs/ADR-6-git-style-guide.md) for git usage

1. In case the PR is done using a branch within the service, it should have the semantic prefix.
2. Before merging into `main` make sure the squash commit has the correct semantic type prefix.
3. If the pull request is related to an issue, link it in the description of the pull request.

Adopting this convention helps us keep the commit history tidy and easier to understand, but also makes it easier to write automated tools on top.

### Automatic version bumping

Following the naming convention enables us to bump the version automatically. Any commit pushed to `main` that doesn't respect the convention will be ignored when determining the new version number.

Check the [Automatic version bumping](AUTOMATIC_VERSION_BUMPING.md) guide to know how your pull request's title should be.


## Any contributions you make will be under the Apache 2.0 Software License

In short, when you submit code changes, your submissions are understood to be under the same [Apache 2.0 License](https://choosealicense.com/licenses/apache-2.0/) that covers the project. Feel free to contact the [maintainers](https://github.com/decentraland/catalyst/blob/main/docs/codeowners) if that's a concern.

## Report bugs using Github's [issues](https://github.com/decentraland/catalyst/issues)

We use GitHub issues to track public bugs. Report a bug by [opening a new issue](https://github.com/decentraland/catalyst/issues/new); it's that easy!

## Write bug reports with detail, background, and sample code

[This is an example](http://stackoverflow.com/q/12488905/180626) of a bug report with the expected quality.

**Great Bug Reports** tend to have:

- A quick summary and/or background
- Steps to reproduce
  - Be specific!
  - Give sample code if you can.
- What you expected would happen
- What actually happens
- Notes (possibly including why you think this might be happening, or stuff you tried that didn't work)

People _love_ thorough bug reports. We'm not even kidding.

## Use a Consistent Coding Style

- You can try running `yarn run lint:check` for style verification and `yarn run lint:fix` for a best-effort fix of any style errors.
- Follow as best as possible the current code architecture, but don't hesitate to propose a change if you see a place for improvement.


## References

This document was adapted from [this](https://gist.github.com/briandk/3d2e8b3ec8daf5a27a62) open-source contribution guideline
