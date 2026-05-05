def success(data: dict, status_code: int = 200):
    return {"success": True, **data}, status_code


def error(message: str, status_code: int = 400):
    return {"success": False, "error": message}, status_code
