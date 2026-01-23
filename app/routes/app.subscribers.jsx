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
  };

  const subscribers = await prisma.backInStock.findMany({
    where: whereClause,
    orderBy: { createdAt: "desc" },
  });

  const stats = {
    total: await prisma.backInStock.count({ where: { shop } }),
    notified: await prisma.backInStock.count({ where: { shop, notified: true } }),
    pending: await prisma.backInStock.count({ where: { shop, notified: false } }),
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

    // Generate CSV with proper escaping
    const csvHeaders = [
      "ID",
      "Email",
      "Product Title",
      "Variant Title",
      "Subscribed Price",
      "Variant ID",
      "Inventory Item ID",
      "Notified",
      "Opened",
      "Clicked",
      "Created At",
      "Updated At",
    ];

    const csvRows = subscribers.map((sub) => [
      sub.id || "",
      sub.email || "",
      sub.productTitle || "",
      sub.variantTitle || "",
      sub.subscribedPrice ? `$${sub.subscribedPrice.toFixed(2)}` : "",
      sub.variantId || "",
      sub.inventoryItemId || "",
      sub.notified ? "Yes" : "No",
      sub.opened ? "Yes" : "No",
      sub.clicked ? "Yes" : "No",
      sub.createdAt ? new Date(sub.createdAt).toLocaleString() : "",
      sub.updatedAt ? new Date(sub.updatedAt).toLocaleString() : "",
    ]);

    // Properly escape CSV fields
    const escapeCSVField = (field) => {
      const stringField = String(field);
      if (stringField.includes(",") || stringField.includes('"') || stringField.includes("\n")) {
        return `"${stringField.replace(/"/g, '""')}"`;
      }
      return stringField;
    };

    const csvContent = [
      csvHeaders.map(escapeCSVField).join(","),
      ...csvRows.map((row) => row.map(escapeCSVField).join(",")),
    ].join("\n");

    const timestamp = new Date().toISOString().split('T')[0];

    return new Response(csvContent, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="subscribers-${timestamp}.csv"`,
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
          flex-wrap: wrap;
        }
        .form-group {
          flex: 1;
          min-width: 200px;
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
          transition: all 0.2s;
        }
        .btn:hover {
          transform: translateY(-1px);
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
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
        .btn-success:hover {
          background: #47a835;
        }
        .table-card {
          background: white;
          border: 1px solid #ddd;
          border-radius: 8px;
          overflow-x: auto;
          box-shadow: 0 2px 4px rgba(0,0,0,0.05);
        }
        table {
          width: 100%;
          border-collapse: collapse;
          min-width: 900px;
        }
        th {
          background: #f6f6f7;
          padding: 12px;
          text-align: left;
          font-size: 13px;
          font-weight: 600;
          color: #202223;
          border-bottom: 1px solid #ddd;
          white-space: nowrap;
        }
        td {
          padding: 12px;
          border-bottom: 1px solid #f1f1f1;
          font-size: 14px;
          max-width: 250px;
          overflow: hidden;
          text-overflow: ellipsis;
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
          white-space: nowrap;
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
          flex-wrap: wrap;
          gap: 15px;
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
        .text-muted {
          color: #6d7175;
          font-size: 13px;
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
                <th>Email</th>
                <th>Product</th>
                <th>Variant</th>
                <th>Subscribed Price</th>
                <th>Status</th>
                <th>Opened</th>
                <th>Clicked</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {subscribers.map((sub) => (
                <tr key={sub.id}>
                  <td title={sub.email}>{sub.email}</td>
                  <td title={sub.productTitle || "N/A"}>
                    {sub.productTitle || <span className="text-muted">No product title</span>}
                  </td>
                  <td title={sub.variantTitle || "N/A"}>
                    {sub.variantTitle || <span className="text-muted">Default variant</span>}
                  </td>
                  <td>
                    {sub.subscribedPrice != null
                      ? `$${Number(sub.subscribedPrice).toFixed(2)}`
                      : <span className="text-muted">N/A</span>}
                  </td>
                  <td>
                    <span
                      className={`badge ${
                        sub.notified ? "badge-success" : "badge-info"
                      }`}
                    >
                      {sub.notified ? "✅ Notified" : "⏳ Pending"}
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
                    {sub.createdAt 
                      ? new Date(sub.createdAt).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric'
                        })
                      : <span className="text-muted">N/A</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}