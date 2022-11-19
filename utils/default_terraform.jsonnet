local barbe = std.extVar("barbe");

barbe.pipelines([{
    apply: [
        function(container) barbe.databags([
            {
                Type: "terraform_execute",
                Name: "default_apply",
                Value: {
                    require_confirmation: !std.objectHas(container, "cr_[terraform]"),
                    message:
                        if !std.objectHas(container, "cr_[terraform]") then
                            "WARNING: using `barbe apply` without an external backend for terraform (such as state_store) WILL lead to your terraform state being lost if the terraform template fails to apply. Run terraform apply anyway? [yes/no]\n"
                        else
                            "Applying Terraform plan, stopping the process now can lead to orphan resources"
                        ,
                    mode: "apply",
                    dir: std.extVar("barbe_output_dir"),
                }
            }
        ]),
        function(container) barbe.databags([
            {
                Name: "terraform_default_apply",
                Type: "barbe_import_component",
                Value: {
                    url: "https://hub.maplecone.com/barbe-serverless/terraform_execute/v0.0.3/.jsonnet"
                }
            }
        ]),
    ],
    destroy: [
        function(container) barbe.databags([
            {
                Type: "terraform_execute",
                Name: "default_destroy",
                Value: {
                    message: "Destroying Terraform plan, stopping the process now can lead to orphan resources",
                    mode: "destroy",
                    dir: std.extVar("barbe_output_dir"),
                }
            }
        ]),
        function(container) barbe.databags([
            {
                Name: "terraform_default_destroy",
                Type: "barbe_import_component",
                Value: {
                    url: "https://hub.maplecone.com/barbe-serverless/terraform_execute/v0.0.3/.jsonnet"
                }
            }
        ]),

    ]
}])