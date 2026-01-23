// File: app/routes/app.subscribers.jsx
import { json } from "@remix-run/node";
import { useLoaderData, Form, useSearchParams } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { useState } from "react";

// Loader: Fetch all subscribers
export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const url = new URL(request.url);
  const searchQuery = url.searchParams.get("search") || "";
  const filterStatus = url.searchParams.get("status") || "all";

  // Build where clause
  const whereClause = {
    shop: shop,
    ...(searchQuery && {
      OR: [
        { email: { contains: searchQuery, mode: "insensitive" } },
        { productTitle: { contains: searchQuery, mode: "insensitive" } },
        { variantTitle: { contains: searchQuery, mode: "insensitive" } },
      ],
    }),
    ...(filterStatus === "notified" && { notified: true }),
    ...(filterStatus === "pending" && { notified: false }),
    ...(filterStatus === "purchased" && { purchased: true }),
  };

  const subscribers = await prisma.backInStock.findMany({
    where: whereClause,
    orderBy: { createdAt: "desc" },
  });

  const stats = {
    total: await prisma.backInStock.count({ where: { shop } }),
    notified: await prisma.backInStock.count({ where: { shop, notified: true } }),
    pending: await prisma.backInStock.count({ where: { shop, notified: false } }),
    purchased: await prisma.backInStock.count({ where: { shop, purchased: true } }),
  };

  return json({ subscribers, stats, shop });
};

// Action: Handle CSV export
export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const formData = await request.formData();
  const actionType = formData.get("action");

  if (actionType === "export") {
    const subscribers = await prisma.backInStock.findMany({
      where: { shop },
      orderBy: { createdAt: "desc" },
    });

    // Generate CSV
    const csvHeaders = [
      "ID",
      "Email",
      "Product Title",
      "Variant Title",
      "Subscribed Price",
      "Notified",
      "Opened",
      "Clicked",
      "Purchased",
      "Created At",
      "Updated At",
    ];

    const csvRows = subscribers.map((sub) => [
      sub.id,
      sub.email,
      sub.productTitle || "",
      sub.variantTitle || "",
      sub.subscribedPrice || "",
      sub.notified ? "Yes" : "No",
      sub.opened ? "Yes" : "No",
      sub.clicked ? "Yes" : "No",
      sub.purchased ? "Yes" : "No",
      new Date(sub.createdAt).toLocaleString(),
      new Date(sub.updatedAt).toLocaleString(),
    ]);

    const csvContent = [
      csvHeaders.join(","),
      ...csvRows.map((row) =>
        row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")
      ),
    ].join("\n");

    return new Response(csvContent, {
      status: 200,
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="subscribers-${new Date().toISOString()}.csv"`,
      },
    });
  }

  return json({ error: "Invalid action" }, { status: 400 });
};

export default function SubscribersPage() {
  const { subscribers, stats } = useLoaderData();
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchValue, setSearchValue] = useState(searchParams.get("search") || "");
  const [filterStatus, setFilterStatus] = useState(searchParams.get("status") || "all");

  const handleSearch = (e) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (searchValue) params.set("search", searchValue);
    if (filterStatus !== "all") params.set("status", filterStatus);
    setSearchParams(params);
  };

  return (
    <div style={{ padding: "20px", maxWidth: "1400px", margin: "0 auto" }}>
      <style>{`
        .stats-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 20px;
          margin-bottom: 30px;
        }
        .stat-card {
          background: white;
          border: 1px solid #ddd;
          border-radius: 8px;
          padding: 20px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.05);
        }
        .stat-card h3 {
          margin: 0 0 10px;
          font-size: 14px;
          color: #666;
          font-weight: 500;
        }
        .stat-card p {
          margin: 0;
          font-size: 32px;
          font-weight: 700;
          color: #000;
        }
        .filter-card {
          background: white;
          border: 1px solid #ddd;
          border-radius: 8px;
          padding: 20px;
          margin-bottom: 20px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.05);
        }
        .filter-form {
          display: flex;
          gap: 15px;
          align-items: end;
        }
        .form-group {
          flex: 1;
        }
        .form-group label {
          display: block;
          margin-bottom: 5px;
          font-size: 14px;
          font-weight: 500;
        }
        .form-group input,
        .form-group select {
          width: 100%;
          padding: 10px;
          border: 1px solid #ddd;
          border-radius: 4px;
          font-size: 14px;
        }
        .btn {
          padding: 10px 20px;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 500;
        }
        .btn-primary {
          background: #5c6ac4;
          color: white;
        }
        .btn-primary:hover {
          background: #4959bd;
        }
        .btn-success {
          background: #50b83c;
          color: white;
        }
        .table-card {
          background: white;
          border: 1px solid #ddd;
          border-radius: 8px;
          overflow: hidden;
          box-shadow: 0 2px 4px rgba(0,0,0,0.05);
        }
        table {
          width: 100%;
          border-collapse: collapse;
        }
        th {
          background: #f6f6f7;
          padding: 12px;
          text-align: left;
          font-size: 13px;
          font-weight: 600;
          color: #202223;
          border-bottom: 1px solid #ddd;
        }
        td {
          padding: 12px;
          border-bottom: 1px solid #f1f1f1;
          font-size: 14px;
        }
        tr:hover {
          background: #f9f9f9;
        }
        .badge {
          display: inline-block;
          padding: 4px 10px;
          border-radius: 12px;
          font-size: 12px;
          font-weight: 500;
        }
        .badge-success {
          background: #d1f7c4;
          color: #108043;
        }
        .badge-info {
          background: #b4e1fa;
          color: #084e8a;
        }
        .badge-default {
          background: #e4e5e7;
          color: #202223;
        }
        .header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 30px;
        }
        .header h1 {
          margin: 0;
          font-size: 24px;
        }
        .empty-state {
          text-align: center;
          padding: 60px 20px;
        }
        .empty-state h3 {
          margin-bottom: 10px;
          color: #202223;
        }
        .empty-state p {
          color: #6d7175;
        }
      `}</style>

      <div className="header">
        <h1>📬 Back in Stock Subscribers</h1>
        <Form method="post">
          <input type="hidden" name="action" value="export" />
          <button type="submit" className="btn btn-success">
            📥 Export CSV
          </button>
        </Form>
      </div>

      {/* Stats Cards */}
      <div className="stats-grid">
        <div className="stat-card">
          <h3>Total Subscribers</h3>
          <p>{stats.total}</p>
        </div>
        <div className="stat-card">
          <h3>Pending</h3>
          <p>{stats.pending}</p>
        </div>
        <div className="stat-card">
          <h3>Notified</h3>
          <p>{stats.notified}</p>
        </div>
        <div className="stat-card">
          <h3>Purchased</h3>
          <p>{stats.purchased}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="filter-card">
        <form onSubmit={handleSearch} className="filter-form">
          <div className="form-group">
            <label>Search</label>
            <input
              type="text"
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              placeholder="Search by email or product"
            />
          </div>
          <div className="form-group" style={{ maxWidth: "200px" }}>
            <label>Filter by Status</label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
            >
              <option value="all">All</option>
              <option value="pending">Pending</option>
              <option value="notified">Notified</option>
              <option value="purchased">Purchased</option>
            </select>
          </div>
          <button type="submit" className="btn btn-primary">
            🔍 Search
          </button>
        </form>
      </div>

      {/* Table */}
      <div className="table-card">
        {subscribers.length === 0 ? (
          <div className="empty-state">
            <h3>No subscribers yet</h3>
            <p>Subscribers will appear here when customers sign up for back in stock notifications.</p>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Email</th>
                <th>Product</th>
                <th>Variant</th>
                <th>Price</th>
                <th>Status</th>
                <th>Opened</th>
                <th>Clicked</th>
                <th>Purchased</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {subscribers.map((sub) => (
                <tr key={sub.id}>
                  <td>{sub.id}</td>
                  <td>{sub.email}</td>
                  <td>{sub.productTitle || "N/A"}</td>
                  <td>{sub.variantTitle || "N/A"}</td>
                  <td>
                    {sub.subscribedPrice
                      ? `$${sub.subscribedPrice.toFixed(2)}`
                      : "N/A"}
                  </td>
                  <td>
                    <span
                      className={`badge ${
                        sub.notified ? "badge-success" : "badge-info"
                      }`}
                    >
                      {sub.notified ? "Notified" : "Pending"}
                    </span>
                  </td>
                  <td>
                    <span
                      className={`badge ${
                        sub.opened ? "badge-success" : "badge-default"
                      }`}
                    >
                      {sub.opened ? "Yes" : "No"}
                    </span>
                  </td>
                  <td>
                    <span
                      className={`badge ${
                        sub.clicked ? "badge-success" : "badge-default"
                      }`}
                    >
                      {sub.clicked ? "Yes" : "No"}
                    </span>
                  </td>
                  <td>
                    <span
                      className={`badge ${
                        sub.purchased ? "badge-success" : "badge-default"
                      }`}
                    >
                      {sub.purchased ? "Yes" : "No"}
                    </span>
                  </td>
                  <td>{new Date(sub.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}