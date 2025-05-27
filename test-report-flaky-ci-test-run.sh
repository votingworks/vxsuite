#!/usr/bin/env bash

export CI=true
export CIRCLECI=true
export CIRCLE_BRANCH=caro/em_networked_config
export CIRCLE_BUILD_NUM=849188
export CIRCLE_BUILD_URL=https://circleci.com/gh/votingworks/vxsuite/849188
export CIRCLE_JOB=validate-monorepo
export CIRCLE_NODE_INDEX=0
export CIRCLE_NODE_TOTAL=1
export CIRCLE_ORGANIZATION_ID=1cde8462-24ca-4dd0-b807-bbbf45019c75
export CIRCLE_PIPELINE_ID=0ab03693-401a-402e-9a05-ef2fad93fea8
export CIRCLE_PROJECT_ID=81c7f65e-a9ad-48e0-a5e0-6e55377b7b8f
export CIRCLE_PROJECT_REPONAME=vxsuite
export CIRCLE_PROJECT_USERNAME=votingworks
export CIRCLE_PULL_REQUEST=https://github.com/votingworks/vxsuite/pull/6390
export CIRCLE_PULL_REQUESTS=https://github.com/votingworks/vxsuite/pull/6390
export CIRCLE_REPOSITORY_URL=git@github.com:votingworks/vxsuite.git
export CIRCLE_SHA1=dc051e89bf4dd1e881b3b71ac4c41868fff655c8
export CIRCLE_SHELL_ENV=/tmp/.bash_env-948dd05e-a677-4e33-8509-4f076c68eee0-0-build
export CIRCLE_USERNAME=carolinemodic
export CIRCLE_WORKFLOW_ID=ae2e945d-66eb-4785-8877-aeefdb25e271
export CIRCLE_WORKFLOW_JOB_ID=948dd05e-a677-4e33-8509-4f076c68eee0
export CIRCLE_WORKFLOW_WORKSPACE_ID=ae2e945d-66eb-4785-8877-aeefdb25e271
export CIRCLE_WORKING_DIRECTORY=/root/project
export CI_PULL_REQUEST=https://github.com/votingworks/vxsuite/pull/6390

# export CI=true
# export CIRCLECI=true
# export CIRCLE_BRANCH=main
# export CIRCLE_BUILD_NUM=849893
# export CIRCLE_BUILD_URL=https://circleci.com/gh/votingworks/vxsuite/849893
# export CIRCLE_JOB=validate-monorepo
# export CIRCLE_NODE_INDEX=0
# export CIRCLE_NODE_TOTAL=1
# export CIRCLE_ORGANIZATION_ID=1cde8462-24ca-4dd0-b807-bbbf45019c75
# export CIRCLE_PIPELINE_ID=17a22960-7444-49ef-8bd2-9fe1c0bbcfdc
# export CIRCLE_PROJECT_ID=81c7f65e-a9ad-48e0-a5e0-6e55377b7b8f
# export CIRCLE_PROJECT_REPONAME=vxsuite
# export CIRCLE_PROJECT_USERNAME=votingworks
# export CIRCLE_REPOSITORY_URL=git@github.com:votingworks/vxsuite.git
# export CIRCLE_SHA1=5b00e0ed34bc99bbfec5e94259ccf79790a96fed
# export CIRCLE_SHELL_ENV=/tmp/.bash_env-f4990b29-f1e3-4fe2-a08e-18f523050d6d-0-build
# export CIRCLE_USERNAME=jonahkagan
# export CIRCLE_WORKFLOW_ID=b81202ad-5a0d-4d74-b39a-e44b3b26982a
# export CIRCLE_WORKFLOW_JOB_ID=f4990b29-f1e3-4fe2-a08e-18f523050d6d
# export CIRCLE_WORKFLOW_WORKSPACE_ID=b81202ad-5a0d-4d74-b39a-e44b3b26982a
# export CIRCLE_WORKING_DIRECTORY=/root/project

export SLACK_FLAKY_TEST_WEBHOOK=https://hooks.slack.com/services/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

./script/report-flaky-ci-test-run
