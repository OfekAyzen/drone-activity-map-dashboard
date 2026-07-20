def _seed(client):
    resp = client.post("/api/pipeline/run", json={"source": "sample_drones.json"})
    assert resp.status_code == 201
    return resp.json()


def test_stats_endpoint_shape_and_values(client):
    _seed(client)
    resp = client.get("/api/stats")
    assert resp.status_code == 200

    body = resp.json()
    assert body["total_records"] == 3
    assert body["avg_battery_percent"] == 44.33
    assert body["by_status"] == {"active": 2, "lost_signal": 1}
    assert body["by_drone_type"] == {"Quadcopter": 1, "Fixed Wing": 1, "VTOL": 1}


def test_stats_endpoint_empty_db(client):
    resp = client.get("/api/stats")
    assert resp.status_code == 200

    body = resp.json()
    assert body["total_records"] == 0
    assert body["avg_battery_percent"] is None
    assert body["by_status"] == {}
    assert body["by_drone_type"] == {}
