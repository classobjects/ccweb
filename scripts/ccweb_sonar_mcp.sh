#!/usr/bin/env bash
# (c) Copyright 2026 Nathaniel Mills
# Open Source licensed under Apache 2.0: https://www.apache.org/licenses/LICENSE-2.0
# SPDX-License-Identifier: Apache-2.0
# ---------------------------------------------------------------------------
#  ccweb_sonar_mcp.sh - the SonarQube MCP server, over stdio.
#
#  The bash twin of ccweb_sonar_mcp.cmd, named as the command in a Linux
#  machine's .mcp.json. It joins sonar-net so the server is reached by name.
#  It prints nothing of its own on stdout -- the MCP client reads it -- and
#  so activates no conda environment.
# ---------------------------------------------------------------------------
set -u
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [ -z "${SONAR_TOKEN:-}" ]; then
    echo "ERROR: SONAR_TOKEN is not set." >&2
    exit 1
fi

export SONARQUBE_TOKEN="$SONAR_TOKEN"
exec podman run --init --rm -i \
    --network sonar-net \
    -e SONARQUBE_TOKEN \
    -e SONARQUBE_URL=http://sonarqube:9000 \
    -e SONARQUBE_PROJECT_KEY=ccweb \
    -v "$REPO:/app/mcp-workspace:ro" \
    docker.io/sonarsource/sonarqube-mcp
