"""Consumer checks against the installed Match package; no provider calls."""

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from conference_match.worker import Request

ROOT = Path(__file__).resolve().parent


class WorkerContract(unittest.TestCase):
    def test_schema_matches_installed_package(self):
        self.assertEqual(
            json.loads((ROOT / "request.schema.json").read_text()),
            Request.model_json_schema(),
        )

    def test_process_result_and_idempotent_restart(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            request = json.loads((ROOT / "example.request.json").read_text())
            request["outputDir"] = str(directory / "job")
            request["roster"][0]["text"] = (
                "Unicode inquiry: ¿cómo? — $(touch forbidden)"
            )
            input_path = directory / "request.json"
            input_path.write_text(json.dumps(request))
            command = [sys.executable, "-m", "conference_match.worker", str(input_path)]
            for _ in range(2):
                completed = subprocess.run(
                    command, check=True, capture_output=True, text=True
                )
                events = [json.loads(line) for line in completed.stdout.splitlines()]
                self.assertEqual(events[-1]["status"], "succeeded")
                self.assertEqual(completed.stderr, "")
            result = json.loads((directory / "job/result.json").read_text())
            self.assertEqual(result["snapshot"], request["snapshot"])
            self.assertEqual(
                result["groups"][0]["participantIds"],
                ["participant-a", "participant-b"],
            )
            self.assertEqual(
                result["groups"][0]["sourceRefs"],
                {"participant-a": ["revision-a"], "participant-b": ["revision-b"]},
            )
            state = json.loads((directory / "job/state.json").read_text())
            self.assertEqual(state["attempt"], 1)
            self.assertEqual(state["providerCalls"], 0)

    def test_standalone_cli_and_pilot_assets_remain_available(self):
        from importlib.resources import files

        completed = subprocess.run(
            [str(Path(sys.executable).with_name("match")), "--help"],
            check=True,
            capture_output=True,
            text=True,
        )
        self.assertIn("serve", completed.stdout)
        self.assertTrue(
            files("conference_match").joinpath("web/pilot/participant.html").is_file()
        )


if __name__ == "__main__":
    unittest.main()
