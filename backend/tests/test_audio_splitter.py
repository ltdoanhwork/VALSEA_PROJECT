"""Tests for audio_splitter module."""

from __future__ import annotations

import pytest

from services import audio_splitter as splitter_mod


def test_needs_splitting_small() -> None:
    data = b"x" * (7 * 1024 * 1024)
    assert splitter_mod.needs_splitting(data) is False


def test_needs_splitting_large() -> None:
    data = b"x" * (9 * 1024 * 1024)
    assert splitter_mod.needs_splitting(data) is True


def test_guess_extension_from_filename() -> None:
    assert splitter_mod._guess_extension("lesson.wav", None) == ".wav"
    assert splitter_mod._guess_extension("talk.m4a", None) == ".m4a"
    assert splitter_mod._guess_extension("vid.mp4", "video/mp4") == ".mp4"


def test_guess_extension_from_mime() -> None:
    assert splitter_mod._guess_extension("file", "audio/mpeg") == ".mp3"
    assert splitter_mod._guess_extension("file", "audio/wav") == ".wav"
    assert splitter_mod._guess_extension("file", "audio/ogg") == ".ogg"


def test_guess_extension_fallback() -> None:
    assert splitter_mod._guess_extension("file.xyz", "application/octet-stream") == ".mp3"


@pytest.mark.asyncio
async def test_split_audio_with_real_ffmpeg(tmp_path) -> None:
    """Integration test: generate a tiny WAV and verify split produces chunks."""
    import subprocess

    wav_path = tmp_path / "test.wav"
    subprocess.run(
        [
            "ffmpeg", "-y",
            "-f", "lavfi", "-i", "sine=frequency=440:duration=3",
            "-ar", "16000", "-ac", "1",
            str(wav_path),
        ],
        capture_output=True,
        check=True,
    )
    data = wav_path.read_bytes()

    chunks = await splitter_mod.split_audio(data, "test.wav", "audio/wav", chunk_duration=1)

    assert len(chunks) >= 2
    for c in chunks:
        assert c.data
        assert c.filename.endswith(".mp3")
    assert chunks[0].index == 0
    assert chunks[-1].index == len(chunks) - 1
