# Automatic version bumping

## Following the convention

Whenever a pull request is merged to `main`, the Github workflow will release a new version, bumping the current version depending on the pull request's title (which will be the message of the commit when merging).

This is only possible if your pull request's title follows the convention set in the [Git Style Guide](https://github.com/decentraland/adr/blob/main/docs/ADR-6-git-style-guide.md) which is based on [semantic commits](https://sparkbox.com/foundry/semantic_commit_messages).

### Validation

 It is crucial to ensure that this convention is being embraced. There is a validation in the Github workflow that will make your pull request's build fail if its title doesn't follow it.

## Version bumping

This chart reflects which type of message bumps `patch`, `minor`, or `major`.

| type      | bumps |
| --------- | ----- |
| break     | major |
| feat      | minor |
| chore     | patch |
| docs      | patch |
| fix       | patch |
| refactor  | patch |
| revert    | patch |
| style     | patch |
| test      | patch |

## More than one type

While developing you will find yourself committing different types of changes so that your commit history could look like this:

```
docs: explain the feature
```
```
feat: add the feature
```
```
test: test the feature
```

What should my pr title be in this case? You should look at what is going to be bumped in the table above and give priority to `major`, then `minor`, and for last `patch`. So for this example, the pr title will look like this

```
feat: not neccesarily the same description as the commit's
```

If your commits are tied in terms of priority, for example, if you only have `docs`, `chore`, and `fix`, select the one that you feel it is more descriptive or more predominant.
