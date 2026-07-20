"""Entry point for the `worker` container (see docker-compose.yml, `prefect` profile).

Running this blocks forever: it registers the ingest flow as a Prefect deployment
and executes runs against it as they're triggered - no separate work-pool/worker
registration step needed, `.serve()` does both.
"""

from app.core.logging import configure_logging
from app.pipeline.prefect_flow import DEPLOYMENT_NAME, ingest_flow

if __name__ == "__main__":
    configure_logging()
    ingest_flow.serve(name=DEPLOYMENT_NAME)
