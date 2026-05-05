class AppError(Exception):
    status_code = 500
    message = "An unexpected error occurred."

    def __init__(self, message=None):
        super().__init__(message or self.message)
        if message:
            self.message = message

    def to_dict(self):
        return {"success": False, "error": self.message}


class ValidationError(AppError):
    status_code = 400
    message = "Validation failed."


class UnauthorizedError(AppError):
    status_code = 401
    message = "Authentication required."


class ForbiddenError(AppError):
    status_code = 403
    message = "You do not have permission to perform this action."


class NotFoundError(AppError):
    status_code = 404
    message = "Resource not found."


class ConflictError(AppError):
    status_code = 409
    message = "Resource already exists."
