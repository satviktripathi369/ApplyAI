import base64
import json
import unittest
import zipfile
from io import BytesIO
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import HTTPException

from llm import _parse_answers, generate_answers
from main import autofill
from models import AutofillRequest


class ParseAnswersTests(unittest.TestCase):
    def test_parses_json_and_fenced_json(self):
        expected_ids = {"first", "second"}
        payload = {
            "answers": {"first": "A", "second": ""},
            "evidence": {"first": "Resume quote", "second": ""},
        }
        expected = (
            payload["answers"],
            payload["evidence"],
        )

        self.assertEqual(
            _parse_answers(json.dumps(payload), expected_ids),
            expected,
        )
        self.assertEqual(
            _parse_answers(f'```json\n{json.dumps(payload)}\n```', expected_ids),
            expected,
        )

    def test_rejects_unexpected_or_missing_ids(self):
        with self.assertRaisesRegex(ValueError, "field IDs"):
            _parse_answers(
                '{"answers": {"first": "A"}, "evidence": {"first": "A"}}',
                {"first", "second"},
            )
        with self.assertRaisesRegex(ValueError, "field IDs"):
            _parse_answers(
                '{"answers": {"first": "A", "other": "B"}, '
                '"evidence": {"first": "A", "other": "B"}}',
                {"first"},
            )

    def test_rejects_non_string_answers(self):
        with self.assertRaisesRegex(ValueError, "strings"):
            _parse_answers(
                '{"answers": {"first": true}, "evidence": {"first": ""}}',
                {"first"},
            )

    def test_discards_evidence_that_is_not_a_resume_quote(self):
        request = AutofillRequest(
            fields=[{
                "id": "name",
                "type": "select",
                "label": "Work model",
                "options": ["Remote", "Hybrid"],
            }],
            resume_text="Engineer at Example",
        )
        completion_response = SimpleNamespace(
            choices=[
                SimpleNamespace(
                    message=SimpleNamespace(
                        content=json.dumps({
                            "answers": {"name": "Avery"},
                            "evidence": {"name": "Invented evidence"},
                        })
                    )
                )
            ]
        )

        with patch("llm.completion", return_value=completion_response) as completion_mock:
            result = generate_answers(request)

        prompt_data = json.loads(completion_mock.call_args.kwargs["messages"][1]["content"])
        self.assertEqual(prompt_data["fields"][0]["options"], ["Remote", "Hybrid"])
        self.assertEqual(result.answers["name"], "Avery")
        self.assertEqual(result.evidence["name"], "")


class GenerateAnswersTests(unittest.TestCase):
    def test_creates_file_answer_in_memory(self):
        request = AutofillRequest(
            fields=[{"id": "cover", "type": "file", "label": "Cover Letter"}],
            resume_text="Experienced engineer",
        )
        completion_response = SimpleNamespace(
            choices=[
                SimpleNamespace(
                    message=SimpleNamespace(
                        content=json.dumps({
                            "answers": {
                                "cover": "First paragraph.\n\nSecond paragraph."
                            },
                            "evidence": {"cover": "Experienced engineer"},
                        })
                    )
                )
            ]
        )

        with patch("llm.completion", return_value=completion_response) as completion_mock:
            result = generate_answers(request)

        messages = completion_mock.call_args.kwargs["messages"]
        self.assertNotIn(request.resume_text, messages[0]["content"])
        self.assertEqual(
            json.loads(messages[1]["content"])["resume"],
            request.resume_text,
        )
        self.assertEqual(result.evidence["cover"], "Experienced engineer")
        prefix, encoded_document = result.answers["cover"].split(",", 1)
        self.assertEqual(
            prefix,
            "data:application/vnd.openxmlformats-officedocument."
            "wordprocessingml.document;base64",
        )
        document_bytes = base64.b64decode(encoded_document)
        with zipfile.ZipFile(BytesIO(document_bytes)) as document:
            self.assertIn("word/document.xml", document.namelist())


class AutofillRequestTests(unittest.TestCase):
    def test_rejects_duplicate_field_ids(self):
        with self.assertRaisesRegex(ValueError, "unique"):
            AutofillRequest(
                fields=[
                    {"id": "same", "type": "text"},
                    {"id": "same", "type": "email"},
                ],
                resume_text="Resume",
            )

    def test_rejects_unknown_provider(self):
        with self.assertRaises(ValueError):
            AutofillRequest(
                fields=[{"id": "name", "type": "text"}],
                resume_text="Resume",
                provider="unknown",
            )

    def test_api_hides_provider_error_details(self):
        request = AutofillRequest(
            fields=[{"id": "name", "type": "text"}],
            resume_text="Resume",
        )
        with patch("main.generate_answers", side_effect=RuntimeError("private detail")):
            with self.assertRaises(HTTPException) as caught:
                autofill(request)

        self.assertEqual(caught.exception.status_code, 502)
        self.assertNotIn("private detail", caught.exception.detail)

    def test_api_reports_provider_outage_as_retryable(self):
        request = AutofillRequest(
            fields=[{"id": "name", "type": "text"}],
            resume_text="Resume",
            provider="gemini",
        )
        outage = type("ServiceUnavailableError", (RuntimeError,), {})(
            "private upstream response"
        )
        with patch("main.generate_answers", side_effect=outage):
            with self.assertRaises(HTTPException) as caught:
                autofill(request)

        self.assertEqual(caught.exception.status_code, 503)
        self.assertEqual(caught.exception.headers["Retry-After"], "5")
        self.assertIn("gemini is temporarily unavailable", caught.exception.detail)
        self.assertNotIn("private upstream response", caught.exception.detail)


if __name__ == "__main__":
    unittest.main()
