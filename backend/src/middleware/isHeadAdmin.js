// Only head admins may change another user's role. Regular admins can still
// view/manage everything else covered by isAdmin (surveys, status, delete).
module.exports = (req, res, next) => {
  if (req.user?.role !== 'head_admin')
    return res.status(403).json({ message: 'เฉพาะ Head Admin เท่านั้นที่เปลี่ยน role ผู้ใช้ได้' });
  next();
};
