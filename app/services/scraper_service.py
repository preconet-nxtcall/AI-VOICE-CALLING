import requests
from bs4 import BeautifulSoup
import re
import ipaddress
import socket
from urllib.parse import urlparse

_MAX_URL_CONTENT_BYTES = 5 * 1024 * 1024


class ScraperService:
    @staticmethod
    def _validate_safe_url(url: str) -> None:
        parsed = urlparse(url)
        if parsed.scheme != "https":
            raise ValueError("URL must start with https://")
        if not parsed.hostname:
            raise ValueError("URL hostname is required")
        if parsed.username or parsed.password:
            raise ValueError("URLs with embedded credentials are not allowed")

        host = parsed.hostname.strip().lower()
        if host in {"localhost", "127.0.0.1", "::1"}:
            raise ValueError("Localhost URLs are not allowed")

        try:
            infos = socket.getaddrinfo(host, None)
        except socket.gaierror:
            raise ValueError("Could not resolve URL hostname")

        for info in infos:
            ip_str = info[4][0]
            ip = ipaddress.ip_address(ip_str)
            if (
                ip.is_private
                or ip.is_loopback
                or ip.is_link_local
                or ip.is_multicast
                or ip.is_reserved
            ):
                raise ValueError("URL points to a non-public network address")

    @staticmethod
    def extract_text_from_url(url: str) -> str:
        ScraperService._validate_safe_url(url)

        try:
            headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36"
            }
            # Fetch the HTML content safely with streaming
            response = requests.get(url, headers=headers, timeout=10, stream=True)
            response.raise_for_status()
            
            # Check content type to avoid downloading large binaries
            content_type = response.headers.get('Content-Type', '')
            if 'text/html' not in content_type and 'text/plain' not in content_type:
                 raise ValueError("URL does not point to an HTML or text page")

            # Check content length (if provided by the server)
            content_length = response.headers.get('Content-Length')
            if content_length and int(content_length) > _MAX_URL_CONTENT_BYTES:
                 raise ValueError("URL content is too large (max 5MB)")

            # Read the content with a hard limit to protect against missing Content-Length headers
            content_bytes = bytearray()
            for chunk in response.iter_content(chunk_size=8192):
                if chunk:
                    content_bytes.extend(chunk)
                if len(content_bytes) > _MAX_URL_CONTENT_BYTES:
                    raise ValueError("URL content exceeded maximum size of 5MB")
            
            # Decode the bytes into a string
            encoding = response.encoding if response.encoding else 'utf-8'
            try:
                html_content = content_bytes.decode(encoding)
            except UnicodeDecodeError:
                html_content = content_bytes.decode('utf-8', errors='ignore')

            # Parse HTML
            soup = BeautifulSoup(html_content, 'html.parser')

            # Extract body (ignore head, meta, etc.)
            body = soup.body
            if not body:
                body = soup

            # Remove script and style elements
            for script_or_style in body(["script", "style", "noscript"]):
                script_or_style.extract()

            # Get text and clean it up
            text = body.get_text(separator=' ', strip=True)
            
            # Remove excessive whitespace
            clean_text = re.sub(r'\s+', ' ', text).strip()
            if not clean_text:
                raise ValueError("No readable text found at the provided URL")
            
            return clean_text

        except requests.RequestException as e:
            raise ValueError(f"Failed to fetch URL: {str(e)}")
        except Exception as e:
            raise Exception(f"Failed to parse URL content: {str(e)}")
