try:
    from psycogreen.gevent import make_psycopg_green
    make_psycopg_green()
except ImportError:
    pass

from app.app import create_app


app = create_app()

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)
