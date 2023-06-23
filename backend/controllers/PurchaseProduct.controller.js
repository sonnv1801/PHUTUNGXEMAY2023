const ProductSupplier = require("../models/ProductSupplier");
const Order = require("../models/Order");
const PurchaseHistory = require("../models/PurchaseHistory");
const Customer = require("../models/User");

const purchaseProductController = {
  purchaseProduct: async (req, res) => {
    try {
      const { customerId, products } = req.body;
      const totalOrderedQuantity = products.reduce(
        (total, product) => total + product.quantity,
        0
      );

      let totalOrderQuantity = 0;
      let totalOrderPrice = 0;
      let totalOrderProfit = 0;
      let totalOrderPricePreview = 0;
      let totalOrderProfitPreview = 0;

      // Tạo đơn đặt hàng mới
      const order = new Order({
        customerId: customerId,
        products: await Promise.all(
          products.map(async (product) => {
            const { productCode, quantity } = product;

            // Lấy thông tin sản phẩm từ nhà cung cấp
            const productSupplier = await ProductSupplier.findOne({
              productCode: productCode,
            });

            if (!productSupplier) {
              throw new Error(
                `Không tìm thấy sản phẩm có mã '${productCode}' từ nhà cung cấp.`
              );
            }

            const productPrice = productSupplier.retailPrice; // Sử dụng giá bán lẻ
            const productProfit = productPrice - productSupplier.wholesalePrice;
            const productTotalPrice = quantity * productPrice;
            const productTotalProfit = quantity * productProfit;

            totalOrderPricePreview += productTotalPrice;
            totalOrderProfitPreview += productTotalProfit;

            return {
              productCode: productCode,
              quantityOrdered: quantity, // Use the respective quantity for each product
              quantityDelivered: 0,
              deliveryStatus: "pending",
              productPrice: productPrice,
              totalPrice: productTotalPrice,
              productProfit: productProfit,
              totalProfit: productTotalProfit,
              supplier: productSupplier.supplier, // Add supplier information
              type: productSupplier.type, // Add supplier information
              link: productSupplier.link, // Add supplier information
              image: productSupplier.image, // Add supplier information
              name: productSupplier.name, // Add supplier information
              salePrice: productSupplier.salePrice, // Add supplier information
              retailPrice: productSupplier.retailPrice, // Add supplier information
              wholesalePrice: productSupplier.wholesalePrice, // Add supplier information
            };
          })
        ),
        totalQuantity: totalOrderedQuantity,
        totalPrice: totalOrderPricePreview,
        totalProfit: totalOrderProfitPreview,
      });

      // Giao hàng cho đến khi đủ số lượng hoặc hết hàng
      for (const product of products) {
        const { productCode, quantity } = product;

        let remainingQuantity = quantity;

        // Lấy thông tin sản phẩm từ nhà cung cấp
        const productSupplier = await ProductSupplier.findOne({
          productCode: productCode,
        });

        if (!productSupplier) {
          throw new Error(
            `Không tìm thấy sản phẩm có mã '${productCode}' từ nhà cung cấp.`
          );
        }

        while (remainingQuantity > 0 && productSupplier.quantity > 0) {
          const quantityToDeliver = Math.min(
            remainingQuantity,
            productSupplier.quantity
          );

          // Ghi nhận giao hàng lần mới
          const delivery = {
            orderId: order._id,
            productCode: productCode,
            quantity: quantityToDeliver,
            deliveryDate: Date.now(),
            customerId: customerId,
          };
          const purchaseHistory = new PurchaseHistory(delivery);
          await purchaseHistory.save();

          // Cập nhật số lượng đã giao và số lượng còn lại của sản phẩm từ nhà cung cấp
          productSupplier.quantity -= quantityToDeliver;
          await productSupplier.save();

          // Cập nhật số lượng đã giao và trạng thái giao hàng trong đơn đặt hàng
          const orderProduct = order.products.find(
            (p) => p.productCode === productCode
          );
          orderProduct.quantityDelivered += quantityToDeliver;
          if (orderProduct.quantityDelivered >= orderProduct.quantityOrdered) {
            orderProduct.deliveryStatus = "completed";
          }

          remainingQuantity -= quantityToDeliver;

          // Tính toán tổng giá tiền và tổng giá lời cho sản phẩm
          const productPrice = productSupplier.retailPrice; // Sử dụng giá bán lẻ
          const productProfit = productPrice - productSupplier.wholesalePrice;
          const productTotalPrice = quantityToDeliver * productPrice;
          const productTotalProfit = quantityToDeliver * productProfit;

          totalOrderQuantity += quantityToDeliver;
          totalOrderPrice += productTotalPrice;
          totalOrderProfit += productTotalProfit;
        }
      }

      // Cập nhật thông tin tổng số lượng, tổng giá tiền và tổng giá lợi nhuận cho đơn hàng
      order.totalQuantity = totalOrderQuantity;
      order.totalPrice = totalOrderPrice;
      order.totalProfit = totalOrderProfit;
      await order.save();

      // Cập nhật thông tin người mua hàng
      const customer = await Customer.findById(customerId);
      if (customer) {
        customer.totalPurchases += order.totalPrice;
        customer.save();
      }

      res.json({
        message: "Đơn đặt hàng đã được xử lý.",
        totalOrderQuantity: totalOrderQuantity,
        totalOrderPrice: totalOrderPrice,
        totalOrderProfit: totalOrderProfit,
        totalOrderPricePreview: totalOrderPricePreview,
        totalOrderProfitPreview: totalOrderProfitPreview,
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  GetOrderByIdUser: async (req, res) => {
    const user = req.params.id;
    try {
      const order = await Order.find({ customerId: user });

      if (!order) {
        return res.status(404).json({ error: "Không tìm thấy" });
      } else {
        return res.json(order);
      }
    } catch (error) {
      console.error("Lỗi truy vấn MongoDB:", error);
      return res.status(500).json({ error: "Lỗi truy vấn dữ liệu" });
    }
  },
  getAllOrder: async (req, res) => {
    try {
      const orders = await Order.find();
      res.status(200).json(orders);
    } catch (err) {
      res.status(500).json(err);
    }
  },
  getProductsByType: async (req, res) => {
    try {
      const type = req.params.type;
      const orders = await Order.find({ "products.type": type }).exec();
      const products = orders.reduce((acc, order) => {
        const matchingProducts = order.products.filter(
          (product) => product.type === type
        );
        return acc.concat(matchingProducts);
      }, []);

      res.json(products);
    } catch (error) {
      console.error("Error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  },

  // Lấy sản phẩm theo ID
  // Lấy sản phẩm theo ID
  getProductById: async (req, res) => {
    try {
      const productId = req.params.productId;

      const order = await Order.findOne({ "products._id": productId }).exec();

      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }

      const product = order.products.find(
        (product) => product._id.toString() === productId
      );

      if (!product) {
        return res.status(404).json({ error: "Product not found" });
      }

      res.json(product);
    } catch (error) {
      console.error("Error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  },
  purchaseProductQuantity: async (req, res) => {
    try {
      const productId = req.params.productId;
      const quantity = req.body.quantity;

      // Tìm sản phẩm trong cơ sở dữ liệu
      const order = await Order.findOne({ "products._id": productId });
      if (!order) {
        return res.status(404).json({ error: "Product not found" });
      }

      // Tìm sản phẩm cần mua
      const product = order.products.find(
        (p) => p._id.toString() === productId
      );
      if (!product) {
        return res.status(404).json({ error: "Product not found" });
      }

      // Kiểm tra số lượng mua không vượt quá số lượng có sẵn
      if (quantity > product.quantityDelivered) {
        return res.status(400).json({ error: "Invalid quantity" });
      }

      // Kiểm tra nếu quantityPurchased đã đạt đến quantityDelivered
      if (product.quantityPurchased === product.quantityDelivered) {
        return res.status(400).json({ error: "Product cannot be purchased" });
      }

      // Tính số lượng còn lại có thể mua
      const remainingQuantity =
        product.quantityDelivered - product.quantityPurchased;

      // Kiểm tra số lượng mua không vượt quá số lượng còn lại có thể mua
      if (quantity > remainingQuantity) {
        return res.status(400).json({ error: "Invalid quantity" });
      }

      // Tăng số lượng khách hàng đã mua
      product.quantityPurchased += quantity;

      // Cập nhật cơ sở dữ liệu
      await order.save();

      res.json({ message: "Product purchased successfully" });
    } catch (error) {
      console.error("Error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  },
  getAllProductsByOrder: async (req, res) => {
    try {
      // Lấy tất cả đơn đặt hàng có `customerId` hợp lệ
      const orders = await Order.find({
        customerId: { $exists: true, $ne: null },
      }).lean();

      // Tạo mảng chứa tất cả sản phẩm
      let allProducts = [];

      // Lặp qua từng đơn đặt hàng và lấy ra sản phẩm
      orders.forEach((order) => {
        const products = order.products;
        allProducts = allProducts.concat(products);
      });

      res.json(allProducts);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  },

  getAllProductToOrder: async (req, res) => {
    try {
      // Tìm tất cả các đơn hàng
      const orders = await Order.find();

      let allProducts = [];

      // Lặp qua các đơn hàng và thu thập danh sách sản phẩm
      orders.forEach((order) => {
        allProducts = allProducts.concat(order.products);
      });

      // Trả về danh sách sản phẩm từ tất cả các đơn hàng
      res.json(allProducts);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Đã xảy ra lỗi server" });
    }
  },
};

module.exports = purchaseProductController;
