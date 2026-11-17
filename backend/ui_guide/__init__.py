# (c) Copyright 2026 Nathaniel Mills
# Open Source licensed under Apache 2.0: https://www.apache.org/licenses/LICENSE-2.0
# SPDX-License-Identifier: Apache-2.0
"""Retake the pictures in docs/ui-guide.md from a made-up demo collection.

    python -m ui_guide all              build the demo database, take every picture
    python -m ui_guide seed             only build the demo database
    python -m ui_guide shots [NAME ...] take pictures (all, or the named ones)
    python -m ui_guide list             name every picture and its screen

Run from `backend/`, with the test cluster running (scripts/ccweb_testdb).
`stack` holds the settings and starts the processes, `demo_data` builds the
collection, `pictures` is the table of pictures and how each is set up, and
`browser` drives headless Chrome over the DevTools protocol.
"""
