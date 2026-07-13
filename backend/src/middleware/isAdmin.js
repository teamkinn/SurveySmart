// Grants access to both regular admins and head admins.
module.exports = (req, res, next) => {
  if (!['admin', 'head_admin'].includes(req.user?.role))
    return res.status(403).json({ message: 'เฉพาะผู้ดูแลระบบเท่านั้น' });
  next();
};
