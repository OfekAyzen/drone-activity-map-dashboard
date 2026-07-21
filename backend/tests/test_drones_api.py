def _seed(client):
    resp = client.post("/api/pipeline/run", json={"source": "sample_drones.json"})
    assert resp.status_code == 201
    return resp.json()


def test_pipeline_run_endpoint_returns_counts(client):
    body = _seed(client)
    assert body["status"] == "completed"
    assert body["total_records"] == 3
    assert body["valid_records"] == 3
    assert body["invalid_records"] == 0


def test_pipeline_runs_history_endpoint(client):
    _seed(client)
    resp = client.get("/api/pipeline/runs")
    assert resp.status_code == 200
    runs = resp.json()
    assert len(runs) == 1
    assert runs[0]["source"] == "sample_drones.json"


def test_list_drones_returns_seeded_records(client):
    _seed(client)
    resp = client.get("/api/drones")
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 3
    assert len(body["items"]) == 3
    assert body["limit"] == 50
    assert body["offset"] == 0


def test_filter_by_status(client):
    _seed(client)
    resp = client.get("/api/drones", params={"status": "lost_signal"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 1
    assert body["items"][0]["drone_id"] == "DRONE-003"


def test_filter_by_min_battery(client):
    _seed(client)
    resp = client.get("/api/drones", params={"min_battery": 50})
    assert resp.status_code == 200
    body = resp.json()
    # sample_drones.json battery levels are 76, 42, 15 - only one clears 50
    assert body["total"] == 1
    assert all(item["battery_percent"] >= 50 for item in body["items"])


def test_filter_by_drone_id(client):
    _seed(client)
    resp = client.get("/api/drones", params={"drone_id": "DRONE-002"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 1
    assert body["items"][0]["drone_id"] == "DRONE-002"


def test_filter_by_operator_id(client):
    _seed(client)
    resp = client.get("/api/drones", params={"operator_id": "OP-456"})
    assert resp.status_code == 200
    assert resp.json()["total"] == 1


def test_pagination_limit_offset(client):
    _seed(client)
    resp = client.get("/api/drones", params={"limit": 1, "offset": 1})
    assert resp.status_code == 200
    body = resp.json()
    assert len(body["items"]) == 1
    assert body["total"] == 3
    assert body["offset"] == 1


def test_get_single_drone_record(client):
    _seed(client)
    listed = client.get("/api/drones").json()["items"][0]
    resp = client.get(f"/api/drones/{listed['id']}")
    assert resp.status_code == 200
    assert resp.json()["drone_id"] == listed["drone_id"]


def test_get_missing_drone_record_returns_404(client):
    resp = client.get("/api/drones/999999")
    assert resp.status_code == 404
    assert resp.json() == {"detail": "Drone record not found"}


def test_invalid_query_param_returns_422(client):
    resp = client.get("/api/drones", params={"min_battery": 500})
    assert resp.status_code == 422


def test_flood_drone_dominates_raw_endpoint(client):
    resp = client.post("/api/pipeline/run", json={"source": "sample_drones_flood.json"})
    assert resp.status_code == 201

    resp = client.get("/api/drones", params={"limit": 3})
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 5
    assert {item["drone_id"] for item in body["items"]} == {"DRONE-001"}


def test_latest_endpoint_returns_every_distinct_drone_despite_flood(client):
    resp = client.post("/api/pipeline/run", json={"source": "sample_drones_flood.json"})
    assert resp.status_code == 201

    resp = client.get("/api/drones/latest", params={"limit": 3})
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 3
    assert {item["drone_id"] for item in body["items"]} == {"DRONE-001", "DRONE-002", "DRONE-003"}


def test_latest_endpoint_route_is_not_shadowed_by_id_route(client):
    resp = client.get("/api/drones/latest")
    assert resp.status_code == 200


def test_stats_endpoint(client):
    _seed(client)
    resp = client.get("/api/stats")
    assert resp.status_code == 200
    body = resp.json()
    assert body["total_records"] == 3
    assert body["by_status"]["active"] == 2
    assert body["by_status"]["lost_signal"] == 1
