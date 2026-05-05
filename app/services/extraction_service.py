import io
from PyPDF2 import PdfReader
from docx import Document

class ExtractionService:
    @staticmethod
    def extract_text_from_txt(file_stream: bytes) -> str:
        try:
            return file_stream.decode('utf-8')
        except UnicodeDecodeError:
            # Fallback to other encodings if utf-8 fails
            return file_stream.decode('latin-1', errors='ignore')

    @staticmethod
    def extract_text_from_pdf(file_stream: bytes) -> str:
        text = ""
        try:
            pdf_reader = PdfReader(io.BytesIO(file_stream))
            for page in pdf_reader.pages:
                extracted_text = page.extract_text()
                if extracted_text:
                    text += extracted_text + "\n"
        except Exception as e:
            # Log the exception in a real application
            print(f"Error extracting PDF: {e}")
            raise Exception("Failed to extract text from PDF")
        return text

    @staticmethod
    def extract_text_from_docx(file_stream: bytes) -> str:
        text = ""
        try:
            doc = Document(io.BytesIO(file_stream))
            for para in doc.paragraphs:
                text += para.text + "\n"
        except Exception as e:
            print(f"Error extracting DOCX: {e}")
            raise Exception("Failed to extract text from DOCX")
        return text

    @staticmethod
    def process_file(file_stream: bytes, filename: str) -> str:
        filename_lower = filename.lower()
        if filename_lower.endswith('.txt'):
            return ExtractionService.extract_text_from_txt(file_stream)
        elif filename_lower.endswith('.pdf'):
            return ExtractionService.extract_text_from_pdf(file_stream)
        elif filename_lower.endswith('.docx'):
            return ExtractionService.extract_text_from_docx(file_stream)
        else:
            raise ValueError(f"Unsupported file type for {filename}")
