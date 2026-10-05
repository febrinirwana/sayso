import argparse
import importlib.metadata
import json
import wave
from pathlib import Path

from vosk import KaldiRecognizer, Model, SetLogLevel


def main():
    parser = argparse.ArgumentParser(description="SAYSO Vosk word-level recognition")
    parser.add_argument("--wav", required=True)
    parser.add_argument("--model", required=True)
    parser.add_argument("--out", required=True)
    args = parser.parse_args()
    if importlib.metadata.version("vosk") != "0.3.45":
        raise RuntimeError("SAYSO requires vosk==0.3.45")
    SetLogLevel(-1)
    model = Model(args.model)
    words = []
    with wave.open(args.wav, "rb") as wav:
        if (wav.getframerate(), wav.getnchannels(), wav.getsampwidth(), wav.getcomptype()) != (16000, 1, 2, "NONE"):
            raise ValueError("Expected 16 kHz mono signed 16-bit PCM WAV")
        recognizer = KaldiRecognizer(model, 16000)
        recognizer.SetWords(True)
        while data := wav.readframes(4000):
            if recognizer.AcceptWaveform(data):
                words.extend(json.loads(recognizer.Result()).get("result", []))
        words.extend(json.loads(recognizer.FinalResult()).get("result", []))
    # Preserve raw seconds/confidence; the TypeScript parser applies S7's integer-ms rounding.
    Path(args.out).write_text(json.dumps(words), encoding="utf-8")


if __name__ == "__main__":
    main()
