# (c) Copyright 2026 Nathaniel Mills
# Open Source licensed under Apache 2.0: https://www.apache.org/licenses/LICENSE-2.0
# SPDX-License-Identifier: Apache-2.0
"""`app.backup_run`: a backup is tidied only once it is proved.

`run` and `main` are always handed the test server's own engine: left to
themselves they open the application's database, which on this machine is
the live one. The export and the proof -- a restore into a second database
-- are replaced here by ones that answer as the test says: the test
database is built from the models and has no migration revision to export
or restore. The proof itself, `prove_workbook`, is run for real in
`tests/test_workbook_backup.py`, on that file's scratch databases.
"""

from __future__ import annotations

import os
from pathlib import Path

import pytest
from app import backup_run, media_backup, workbook_backup
from app.backup_run import main, run
from app.models import Image
from sqlalchemy import Engine, delete
from sqlalchemy.orm import Session


@pytest.fixture(autouse=True)
def exported(monkeypatch: pytest.MonkeyPatch) -> list[Path]:
    """Each workbook the run exports, written as a small file in its place."""
    written: list[Path] = []

    def export(_engine: Engine, path: Path) -> dict[str, int]:
        """Write a stand-in workbook and say three rows went into it."""
        path.write_bytes(b"the new workbook")
        written.append(path)
        return {"inventory_item": 3}

    monkeypatch.setattr(workbook_backup, "export_workbook", export)
    return written


@pytest.fixture(autouse=True)
def archive(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """The archive folder the command tidies dumps in: never the real one."""
    folder = tmp_path / "archive"
    monkeypatch.setattr(backup_run.settings, "ccweb_archive_dir", folder)
    return folder


def _proved(*_args: object, **_kwargs: object) -> list[str]:
    """A proof that finds the workbook right."""
    return []


DIFFERENCE = "the workbook differs from live in inventory_item: 3 rows live, 2 restored"


def _differs(*_args: object, **_kwargs: object) -> list[str]:
    """A proof that finds the workbook wrong."""
    return [DIFFERENCE]


def _older(folder: Path, *stamps: str) -> list[Path]:
    """Earlier backups' workbooks in `folder`, one per time stamp."""
    folder.mkdir(parents=True, exist_ok=True)
    made = []
    for stamp in stamps:
        path = folder / f"ccwebdb_{stamp}.xlsx"
        path.write_bytes(b"an earlier workbook")
        made.append(path)
    return made


def _names(folder: Path) -> list[str]:
    """The files directly in `folder`, by name."""
    return sorted(path.name for path in folder.iterdir() if path.is_file())


def test_a_proved_backup_replaces_the_older_workbooks(
    engine: Engine, tmp_path: Path
) -> None:
    folder = tmp_path / "backup"
    _older(folder, "20260101_000000", "20260301_000000")

    done = run(engine, folder, stamp="20261007_120000", prove=_proved)

    assert done.proved
    assert _names(folder) == ["ccwebdb_20261007_120000.xlsx"]
    assert sorted(path.name for path in done.removed) == [
        "ccwebdb_20260101_000000.xlsx",
        "ccwebdb_20260301_000000.xlsx",
    ]
    assert done.workbook.read_bytes() == b"the new workbook"
    assert done.rows == 3


def test_a_backup_that_is_not_proved_removes_nothing(
    engine: Engine, tmp_path: Path
) -> None:
    folder = tmp_path / "backup"
    _older(folder, "20260101_000000", "20260301_000000")

    done = run(engine, folder, stamp="20261007_120000", prove=_differs)

    assert not done.proved
    assert done.problems == [DIFFERENCE]
    assert done.removed == []
    # The older ones are the only proved copies there are: all still there,
    # with the new one left beside them to be looked at.
    assert _names(folder) == [
        "ccwebdb_20260101_000000.xlsx",
        "ccwebdb_20260301_000000.xlsx",
        "ccwebdb_20261007_120000.xlsx",
    ]


def test_photographs_are_pruned_only_when_the_backup_is_proved(
    engine: Engine, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    pruned: list[Path] = []

    def prune(_db: object, folder: Path, *, delete: bool) -> media_backup.MediaPrune:
        """Note the folder a prune was asked to delete from."""
        assert delete
        pruned.append(folder)
        return media_backup.MediaPrune(deleted=4)

    monkeypatch.setattr(media_backup, "prune_media", prune)
    folder = tmp_path / "backup"

    unproved = run(engine, folder, stamp="20261007_120000", prove=_differs)
    assert pruned == []
    assert unproved.pruned == 0

    proved = run(engine, folder, stamp="20261007_120500", prove=_proved)
    assert pruned == [folder / "media"]
    assert proved.pruned == 4


def test_a_photograph_wrong_in_the_copy_leaves_the_backup_unproved(
    engine: Engine, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(
        media_backup,
        "check_media",
        lambda _db, _folder: ["missing from the copy: originals/ab/abc.jpg"],
    )
    folder = tmp_path / "backup"
    _older(folder, "20260101_000000")

    done = run(engine, folder, stamp="20261007_120000", prove=_proved)

    assert done.problems == ["missing from the copy: originals/ab/abc.jpg"]
    assert done.removed == []
    assert (folder / "ccwebdb_20260101_000000.xlsx").is_file()


def test_keep_says_how_many_workbooks_stay_the_newest_first(
    engine: Engine, tmp_path: Path
) -> None:
    folder = tmp_path / "backup"
    # Not made in date order: the name's time stamp is what orders them.
    _older(folder, "20260301_000000", "20260101_000000", "20260201_000000")

    done = run(engine, folder, keep=2, stamp="20261007_120000", prove=_proved)

    assert _names(folder) == [
        "ccwebdb_20260301_000000.xlsx",
        "ccwebdb_20261007_120000.xlsx",
    ]
    assert len(done.removed) == 2


def test_only_this_command_s_workbooks_are_ever_removed(
    engine: Engine, tmp_path: Path
) -> None:
    folder = tmp_path / "backup"
    _older(folder, "20260101_000000")
    (folder / "my_coins.xlsx").write_bytes(b"someone else's workbook")
    (folder / "notes.txt").write_text("keep me", encoding="utf-8")
    (folder / "media").mkdir()
    (folder / "media" / "ccwebdb_20200101_000000.xlsx").write_bytes(b"not at the top")

    run(engine, folder, stamp="20261007_120000", prove=_proved)

    assert _names(folder) == [
        "ccwebdb_20261007_120000.xlsx",
        "my_coins.xlsx",
        "notes.txt",
    ]
    assert (folder / "media" / "ccwebdb_20200101_000000.xlsx").is_file()


def test_a_workbook_a_person_named_is_never_removed(
    engine: Engine, tmp_path: Path
) -> None:
    """Only a name of this command's own making -- date, time, nothing else.

    A corrected copy, a copy made in the file manager and an export saved
    under a name of the owner's choosing all begin as the command's own do.
    """
    folder = tmp_path / "backup"
    _older(folder, "20260101_000000")
    kept = [
        "ccwebdb_20260101_000000 - Copy.xlsx",
        "ccwebdb_20260101_corrected.xlsx",
        "ccwebdb_before_the_cleanup.xlsx",
    ]
    for name in kept:
        (folder / name).write_bytes(b"a person's workbook")

    done = run(engine, folder, stamp="20261007_120000", prove=_proved)

    assert [path.name for path in done.removed] == ["ccwebdb_20260101_000000.xlsx"]
    assert _names(folder) == sorted([*kept, "ccwebdb_20261007_120000.xlsx"])


def test_a_workbook_a_person_named_takes_no_place_among_those_kept(
    engine: Engine, tmp_path: Path
) -> None:
    """It sorts after every time stamp, and would count as the newest."""
    folder = tmp_path / "backup"
    _older(folder, "20260101_000000", "20260301_000000")
    (folder / "ccwebdb_final.xlsx").write_bytes(b"a person's workbook")

    run(engine, folder, keep=2, stamp="20261007_120000", prove=_proved)

    assert _names(folder) == [
        "ccwebdb_20260301_000000.xlsx",
        "ccwebdb_20261007_120000.xlsx",
        "ccwebdb_final.xlsx",
    ]


def test_photographs_are_not_pruned_while_older_workbooks_are_kept(
    engine: Engine, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """An older workbook kept still names the photographs it was exported with.

    Pruning to what live names today would leave that workbook restoring
    rows whose pictures are gone, so with more than one kept nothing is
    pruned.
    """
    pruned: list[Path] = []

    def prune(_db: object, folder: Path, *, delete: bool) -> media_backup.MediaPrune:
        """Note that a prune was asked for at all."""
        pruned.append(folder)
        return media_backup.MediaPrune(deleted=4)

    monkeypatch.setattr(media_backup, "prune_media", prune)
    folder = tmp_path / "backup"
    _older(folder, "20260101_000000")

    done = run(engine, folder, keep=2, stamp="20261007_120000", prove=_proved)

    assert done.proved
    assert pruned == []
    assert done.pruned == 0
    assert done.not_pruned is not None
    assert "--keep 2" in done.not_pruned


def test_photographs_are_not_pruned_when_their_rows_changed_after_the_export(
    engine: Engine, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The prune reads live as it is now; the new workbook holds it as exported.

    A photograph's row saved while the proof runs is one the workbook does
    not hold: the run is still proved, and the prune waits for the next run.
    """
    pruned: list[Path] = []

    def prune(_db: object, folder: Path, *, delete: bool) -> media_backup.MediaPrune:
        """Note that a prune was asked for at all."""
        pruned.append(folder)
        return media_backup.MediaPrune(deleted=4)

    sha = "0" * 63 + "1"

    def prove_while_a_photograph_is_saved(
        live: Engine, _workbook: Path, *, stamp: str
    ) -> list[str]:
        """Find the workbook right, while a photograph is saved to live."""
        with Session(live) as db:
            db.add(
                Image(
                    sha256=sha,
                    storage_key=f"originals/00/{sha}.jpg",
                    media_type="image/jpeg",
                    byte_size=1,
                )
            )
            db.commit()
        return []

    monkeypatch.setattr(media_backup, "prune_media", prune)
    # The new row's file is not in the copy; that check is not what is tested.
    monkeypatch.setattr(media_backup, "check_media", lambda _db, _folder: [])
    folder = tmp_path / "backup"
    try:
        done = run(
            engine,
            folder,
            stamp="20261007_120000",
            prove=prove_while_a_photograph_is_saved,
        )
    finally:
        with Session(engine) as db:
            db.execute(delete(Image).where(Image.sha256 == sha))
            db.commit()

    assert done.proved
    assert pruned == []
    assert done.pruned == 0
    assert done.not_pruned is not None
    assert "changed after the export" in done.not_pruned


def test_a_prune_that_was_refused_is_said_not_counted_as_none_found(
    engine: Engine,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    """A refusal is not a failed backup, and is not "0 obsolete files" either."""
    monkeypatch.setattr(backup_run, "prove_workbook", _proved)
    monkeypatch.setattr(
        media_backup,
        "prune_media",
        lambda _db, _folder, *, delete: media_backup.MediaPrune(
            refused="no photographs are recorded: nothing is judged obsolete"
        ),
    )
    folder = tmp_path / "backup"

    assert main([str(folder)], live=engine) == 0

    printed = capsys.readouterr().out
    assert (
        "photographs not pruned: no photographs are recorded: nothing is judged "
        "obsolete" in printed
    )
    assert "pruned 0 obsolete" not in printed


def test_the_proof_is_handed_the_workbook_that_was_just_written(
    engine: Engine, tmp_path: Path
) -> None:
    seen: list[tuple[bool, str]] = []

    def prove(live: Engine, workbook: Path, *, stamp: str) -> list[str]:
        """Note that the file is already on disk when the proof starts."""
        seen.append((live is engine and workbook.is_file(), stamp))
        return []

    done = run(engine, tmp_path / "backup", stamp="20261007_120000", prove=prove)

    assert seen == [(True, "20261007_120000")]
    assert done.workbook.name == "ccwebdb_20261007_120000.xlsx"


def test_the_command_exits_0_and_says_what_it_proved(
    engine: Engine,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    monkeypatch.setattr(backup_run, "prove_workbook", _proved)
    folder = tmp_path / "backup"
    _older(folder, "20260101_000000")

    assert main([str(folder)], live=engine) == 0

    printed = capsys.readouterr()
    assert "proved: the workbook restores to exactly what live holds" in printed.out
    assert "removed the older workbook ccwebdb_20260101_000000.xlsx" in printed.out
    assert printed.err == ""


def test_the_command_exits_1_and_says_nothing_was_removed(
    engine: Engine,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    monkeypatch.setattr(backup_run, "prove_workbook", _differs)
    folder = tmp_path / "backup"
    _older(folder, "20260101_000000")

    assert main([str(folder)], live=engine) == 1

    printed = capsys.readouterr()
    assert "NOT PROVED: 1 problem(s). Nothing was removed" in printed.err
    assert DIFFERENCE in printed.err
    assert (folder / "ccwebdb_20260101_000000.xlsx").is_file()


def test_an_export_that_is_refused_exits_1_and_removes_nothing(
    engine: Engine,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    """No workbook was written, so nothing was proved and nothing may go."""

    def refuse(_engine: Engine, _path: Path) -> dict[str, int]:
        """Stand in for the export, refusing a value a cell cannot hold."""
        raise workbook_backup.WorkbookError("vendor id 3, notes: a carriage return")

    monkeypatch.setattr(workbook_backup, "export_workbook", refuse)
    monkeypatch.setattr(backup_run, "prove_workbook", _proved)
    folder = tmp_path / "backup"
    _older(folder, "20260101_000000")

    assert main([str(folder)], live=engine) == 1

    printed = capsys.readouterr()
    assert "NOT PROVED: the database could not be exported" in printed.err
    assert "vendor id 3, notes" in printed.err
    assert "Nothing was removed" in printed.err
    assert _names(folder) == ["ccwebdb_20260101_000000.xlsx"]


def _dumps(folder: Path, *names: str) -> list[Path]:
    """Pre-change dumps in `folder`, each a day older than the one after it.

    Their times, not their names, say which is newest: the names begin with
    what the change was, so they do not sort by when it was made.
    """
    folder.mkdir(parents=True, exist_ok=True)
    made = []
    for day, name in enumerate(names):
        path = folder / name
        path.write_bytes(b"PGDMP a pg_dump")
        os.utime(path, (1_790_000_000 + day * 86_400,) * 2)
        made.append(path)
    return made


def test_no_dump_goes_while_the_newest_may_still_be_being_written(
    engine: Engine, tmp_path: Path
) -> None:
    """A pg_dump taken as the backup runs is newest, and may yet fail."""
    folder = tmp_path / "backup"
    made = _dumps(folder, "ccwebdb_pre_a_20261101.dump", "ccwebdb_pre_b_20261102.dump")
    made[-1].touch()

    done = run(engine, folder, stamp="20261114_200000", prove=_proved, dumps=folder)

    assert done.removed_dumps == []
    assert done.dumps_kept == "ccwebdb_pre_b_20261102.dump was written in the last hour"
    assert all(path.is_file() for path in made)


def test_no_dump_goes_when_the_newest_is_not_a_whole_archive(
    engine: Engine, tmp_path: Path
) -> None:
    """A failed pg_dump leaves an empty or partial file; it must not survive alone."""
    folder = tmp_path / "backup"
    made = _dumps(folder, "ccwebdb_pre_a_20261101.dump", "ccwebdb_pre_b_20261102.dump")
    stamp = made[-1].stat().st_mtime
    made[-1].write_bytes(b"")
    os.utime(made[-1], (stamp, stamp))

    done = run(engine, folder, stamp="20261114_200000", prove=_proved, dumps=folder)

    assert done.removed_dumps == []
    assert (
        done.dumps_kept == "ccwebdb_pre_b_20261102.dump is not a whole pg_dump archive"
    )
    assert all(path.is_file() for path in made)


def test_a_proved_backup_removes_all_but_the_newest_dump(
    engine: Engine, tmp_path: Path
) -> None:
    folder = tmp_path / "backup"
    _dumps(
        folder,
        "ccwebdb_pre_wheat_metal_20261112.dump",
        "ccwebdb_pre_odd_certs_20261114.dump",
        "ccwebdb_pre_label_applied_20261114.dump",
    )

    done = run(engine, folder, stamp="20261114_200000", prove=_proved, dumps=folder)

    assert _names(folder) == [
        "ccwebdb_20261114_200000.xlsx",
        "ccwebdb_pre_label_applied_20261114.dump",
    ]
    assert sorted(path.name for path in done.removed_dumps) == [
        "ccwebdb_pre_odd_certs_20261114.dump",
        "ccwebdb_pre_wheat_metal_20261112.dump",
    ]


def test_a_backup_that_is_not_proved_removes_no_dump(
    engine: Engine, tmp_path: Path
) -> None:
    folder = tmp_path / "backup"
    made = _dumps(folder, "ccwebdb_pre_a_20261101.dump", "ccwebdb_pre_b_20261102.dump")

    done = run(engine, folder, stamp="20261114_200000", prove=_differs, dumps=folder)

    assert done.removed_dumps == []
    assert all(path.is_file() for path in made)


def test_only_pre_change_dumps_are_ever_removed(engine: Engine, tmp_path: Path) -> None:
    """A dump under any other name is a person's, and takes no place either."""
    folder = tmp_path / "backup"
    kept = ["my_copy.dump", "ccwebdb.dump", "ccwebdb_pre_x_20261101.dump.bak"]
    _dumps(folder, *kept, "ccwebdb_pre_a_20261101.dump", "ccwebdb_pre_b_20261102.dump")

    done = run(engine, folder, stamp="20261114_200000", prove=_proved, dumps=folder)

    assert [path.name for path in done.removed_dumps] == ["ccwebdb_pre_a_20261101.dump"]
    assert _names(folder) == sorted(
        [*kept, "ccwebdb_20261114_200000.xlsx", "ccwebdb_pre_b_20261102.dump"]
    )


def test_the_command_says_which_dumps_it_removed(
    engine: Engine,
    archive: Path,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    """The dumps are where pg_dump wrote them, not in the backup folder."""
    monkeypatch.setattr(backup_run, "prove_workbook", _proved)
    folder = tmp_path / "backup"
    _dumps(archive, "ccwebdb_pre_a_20261101.dump", "ccwebdb_pre_b_20261102.dump")
    _dumps(folder, "ccwebdb_pre_c_20261101.dump", "ccwebdb_pre_d_20261102.dump")

    assert main([str(folder)], live=engine) == 0

    assert _names(archive) == ["ccwebdb_pre_b_20261102.dump"]
    assert "ccwebdb_pre_c_20261101.dump" in _names(folder)

    assert (
        "removed the older dump ccwebdb_pre_a_20261101.dump" in capsys.readouterr().out
    )


def test_keeping_no_workbook_at_all_is_refused(
    engine: Engine, tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    with pytest.raises(SystemExit) as stopped:
        main([str(tmp_path / "backup"), "--keep", "0"], live=engine)
    assert stopped.value.code == 2
    assert "--keep must be at least 1" in capsys.readouterr().err
    assert not (tmp_path / "backup").exists()
